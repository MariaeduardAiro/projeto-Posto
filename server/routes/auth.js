// ============================================================
// auth.js - Rotas de autenticacao
// ------------------------------------------------------------
// Rotas:
//   POST /api/auth/cadastro   -> cria conta e envia codigo por e-mail
//   POST /api/auth/verificar  -> confere o codigo e ativa a conta
//   POST /api/auth/login      -> login (so se verificado)
//   POST /api/auth/reenviar   -> reenvia o codigo
//   GET  /api/auth/eu         -> dados do usuario logado
// ============================================================

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const db = require("../database");
const {
  enviarCodigoVerificacao,
  enviarCodigoRecuperacao,
} = require("../mailer");
const rateLimit = require("express-rate-limit");

const router = express.Router();

// --- Validacoes ---
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarEmail(email) {
  return typeof email === "string" && EMAIL_REGEX.test(email.trim());
}

function validarSenha(senha) {
  if (typeof senha !== "string" || senha.length < 8)
    return "A senha precisa ter no minimo 8 caracteres.";
  if (!/[A-Za-z]/.test(senha)) return "A senha precisa ter pelo menos 1 letra.";
  if (!/[0-9]/.test(senha)) return "A senha precisa ter pelo menos 1 numero.";
  return null;
}

// --- Gera um codigo de 6 digitos ---
function gerarCodigo() {
  // randomInt(min, max) gera um inteiro entre min (inclusive) e max (exclusive)
  // 100000..999 = sempre 6 digitos
  return String(crypto.randomInt(100000, 1000000));
}

// --- Protege rotas (verifica o token JWT enviado no cookie) ---
function autenticar(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ erro: "Nao autenticado." });
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ erro: "Sessao invalida ou expirada." });
  }
}

// --- Registra acao na auditoria ---
// Este registro NUNCA deve derrubar a requisicao principal, por isso
// normalizamos os valores e protegemos tudo com try/catch.
function auditar(usuarioId, acao, ip, detalhes) {
  try {
    const idValido =
      usuarioId === null || usuarioId === undefined || Number.isNaN(Number(usuarioId))
        ? null
        : Number(usuarioId);
    const ipValido = typeof ip === "string" && ip.length ? ip : "desconhecido";
    const acaoValida = typeof acao === "string" && acao.length ? acao : "desconhecida";

    db.prepare(
      `INSERT INTO logs_auditoria (usuario_id, acao, ip)
       VALUES (?, ?, ?)`,
    ).run(idValido, acaoValida, ipValido);
  } catch (e) {
    // Falha na auditoria nao pode quebrar o fluxo principal
    console.error("[auditar] falhou:", e.message);
  }
}

// ============================================================
// CADASTRO
// ============================================================
router.post("/cadastro", async (req, res) => {
  try {
    const { email, senha, confirmar, nome } = req.body;

    if (!validarEmail(email))
      return res.status(400).json({ erro: "E-mail invalido." });

    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ erro: erroSenha });

    if (senha !== confirmar)
      return res.status(400).json({ erro: "As senhas nao conferem." });

    const emailLimpo = email.trim().toLowerCase();

    // Verifica se o e-mail ja existe
    const existente = db
      .prepare("SELECT id, verificado FROM usuarios WHERE email = ?")
      .get(emailLimpo);

    if (existente && existente.verificado)
      return res.status(409).json({ erro: "Este e-mail ja esta cadastrado." });

    // Criptografa a senha (NUNCA guardamos texto puro!)
    const senhaHash = bcrypt.hashSync(senha, 12);

    let usuarioId;
    if (existente) {
      // E-mail existe mas nao foi verificado: atualiza os dados
      db.prepare(
        `UPDATE usuarios SET senha_hash = ?, nome = ?, atualizado_em = datetime('now')
         WHERE id = ?`,
      ).run(senhaHash, nome || null, existente.id);
      usuarioId = existente.id;
    } else {
      const info = db
        .prepare(
          `INSERT INTO usuarios (email, nome, senha_hash)
           VALUES (?, ?, ?)`,
        )
        .run(emailLimpo, nome || null, senhaHash);
      // node:sqlite retorna lastInsertRowid como BigInt -> converte para Number
      usuarioId = Number(info.lastInsertRowid);
    }

    // Gera e salva o codigo de verificacao (tambem criptografado)
    await enviarCodigo(usuarioId, emailLimpo, nome);

    auditar(usuarioId, "cadastro", req.ip, emailLimpo);

    return res.json({
      ok: true,
      mensagem: "Cadastro criado! Enviamos um codigo para seu e-mail.",
      email: emailLimpo,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

// ============================================================
// VERIFICAR CODIGO
// ============================================================
router.post("/verificar", async (req, res) => {
  try {
    const { email, codigo } = req.body;
    if (!validarEmail(email) || !codigo)
      return res.status(400).json({ erro: "Dados incompletos." });

    const emailLimpo = email.trim().toLowerCase();
    const usuario = db
      .prepare("SELECT * FROM usuarios WHERE email = ?")
      .get(emailLimpo);

    if (!usuario)
      return res.status(404).json({ erro: "Usuario nao encontrado." });
    if (usuario.verificado)
      return res.json({ ok: true, mensagem: "E-mail ja verificado." });

    // Busca o codigo valido mais recente
    const registro = db
      .prepare(
        `SELECT * FROM codigos_verificacao
         WHERE usuario_id = ? AND tipo = 'verificacao' AND usado = 0
           AND expira_em > datetime('now')
         ORDER BY id DESC LIMIT 1`,
      )
      .get(usuario.id);

    if (!registro)
      return res
        .status(400)
        .json({ erro: "Codigo expirado ou inexistente. Reenvie." });

    // Compara o codigo digitado com o hash salvo
    const confere = bcrypt.compareSync(String(codigo), registro.codigo_hash);
    if (!confere) {
      auditar(usuario.id, "codigo_errado", req.ip, null);
      return res.status(400).json({ erro: "Codigo incorreto." });
    }

    // Marca codigo como usado e ativa a conta
    db.prepare("UPDATE codigos_verificacao SET usado = 1 WHERE id = ?").run(
      registro.id,
    );
    db.prepare(
      "UPDATE usuarios SET verificado = 1, atualizado_em = datetime('now') WHERE id = ?",
    ).run(usuario.id);

    auditar(usuario.id, "email_verificado", req.ip, null);

    return res.json({
      ok: true,
      mensagem: "E-mail verificado! Ja pode fazer login.",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

// ============================================================
// REENVIAR CODIGO
// ============================================================
router.post("/reenviar", async (req, res) => {
  try {
    const { email } = req.body;
    if (!validarEmail(email))
      return res.status(400).json({ erro: "E-mail invalido." });

    const emailLimpo = email.trim().toLowerCase();
    const usuario = db
      .prepare("SELECT * FROM usuarios WHERE email = ?")
      .get(emailLimpo);
    if (!usuario)
      return res.status(404).json({ erro: "Usuario nao encontrado." });
    if (usuario.verificado)
      return res.json({ ok: true, mensagem: "E-mail ja verificado." });

    await enviarCodigo(usuario.id, emailLimpo, usuario.nome);
    return res.json({ ok: true, mensagem: "Novo codigo enviado!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

// ============================================================
// RECUPERAR SENHA
// ============================================================
router.post("/solicitar-recuperacao", async (req, res) => {
  try {
    const { email } = req.body;
    if (!validarEmail(email))
      return res.status(400).json({ erro: "E-mail invalido." });

    const emailLimpo = email.trim().toLowerCase();
    const usuario = db
      .prepare("SELECT id, email, nome FROM usuarios WHERE email = ?")
      .get(emailLimpo);

    // Resposta igual para e-mails existentes e inexistentes.
    if (usuario) await enviarCodigoRecuperacaoCodigo(usuario.id, usuario.email, usuario.nome);
    return res.json({
      ok: true,
      mensagem: "Se o e-mail estiver cadastrado, enviaremos um codigo de recuperacao.",
      email: emailLimpo,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

router.post("/redefinir-senha", (req, res) => {
  try {
    const { email, codigo, senha, confirmar } = req.body;
    if (!validarEmail(email) || !codigo)
      return res.status(400).json({ erro: "Dados incompletos." });

    const erroSenha = validarSenha(senha);
    if (erroSenha) return res.status(400).json({ erro: erroSenha });
    if (senha !== confirmar)
      return res.status(400).json({ erro: "As senhas nao conferem." });

    const emailLimpo = email.trim().toLowerCase();
    const usuario = db
      .prepare("SELECT id FROM usuarios WHERE email = ?")
      .get(emailLimpo);
    if (!usuario) return res.status(400).json({ erro: "Codigo invalido ou expirado." });

    const registro = db
      .prepare(
        `SELECT * FROM codigos_verificacao
         WHERE usuario_id = ? AND tipo = 'recuperacao' AND usado = 0
           AND expira_em > datetime('now')
         ORDER BY id DESC LIMIT 1`,
      )
      .get(usuario.id);
    if (!registro || !bcrypt.compareSync(String(codigo), registro.codigo_hash))
      return res.status(400).json({ erro: "Codigo invalido ou expirado." });

    db.prepare("UPDATE usuarios SET senha_hash = ?, atualizado_em = datetime('now') WHERE id = ?")
      .run(bcrypt.hashSync(senha, 12), usuario.id);
    db.prepare("UPDATE codigos_verificacao SET usado = 1 WHERE id = ?").run(registro.id);
    auditar(usuario.id, "senha_recuperada", req.ip, null);
    return res.json({ ok: true, mensagem: "Senha redefinida com sucesso. Ja pode entrar." });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

// ============================================================
// LOGIN
// ============================================================
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // no maximo 10 tentativas por IP
  message: { erro: "Muitas tentativas. Tente novamente em 15 minutos." },
});

router.post("/login", loginLimiter, (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!validarEmail(email) || !senha)
      return res.status(400).json({ erro: "Preencha e-mail e senha." });

    const emailLimpo = email.trim().toLowerCase();
    const usuario = db
      .prepare("SELECT * FROM usuarios WHERE email = ?")
      .get(emailLimpo);

    // Mensagem generica (nao revela se o e-mail existe -> seguranca)
    if (!usuario) {
      auditar(null, "login_falha", req.ip, emailLimpo);
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }

    const senhaOk = bcrypt.compareSync(senha, usuario.senha_hash);
    if (!senhaOk) {
      auditar(usuario.id, "login_falha", req.ip, emailLimpo);
      return res.status(401).json({ erro: "E-mail ou senha incorretos." });
    }

    // Login so e permitido se o e-mail foi verificado
    if (!usuario.verificado) {
      return res.status(403).json({
        erro: "E-mail ainda nao verificado. Confirme o codigo enviado.",
        naoVerificado: true,
        email: emailLimpo,
      });
    }

    // Cria o token JWT e guarda num cookie httpOnly (mais seguro)
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || "7d" },
    );

    // Portas diferentes no mesmo hostname (localhost -> localhost ou
    // 127.0.0.1 -> 127.0.0.1) ainda sao "same-site". Assim o cookie pode
    // permanecer Lax e funcionar no HTTP local. SameSite=None + Secure fica
    // reservado para frontend e API em hosts realmente diferentes.
    const origem = req.headers.origin || "";
    let hostDaOrigem = "";
    try {
      hostDaOrigem = new URL(origem).hostname;
    } catch {}
    const hostsDiferentes = Boolean(hostDaOrigem && hostDaOrigem !== req.hostname);

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: hostsDiferentes ? "none" : "lax",
      secure: hostsDiferentes,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    auditar(usuario.id, "login_ok", req.ip, null);

    return res.json({
      ok: true,
      mensagem: "Login realizado com sucesso!",
      usuario: { id: usuario.id, email: usuario.email, nome: usuario.nome },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ erro: "Erro no servidor." });
  }
});

// ============================================================
// LOGOUT
// ============================================================
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  return res.json({ ok: true, mensagem: "Sessao encerrada." });
});

// ============================================================
// DADOS DO USUARIO LOGADO
// ============================================================
router.get("/eu", autenticar, (req, res) => {
  const usuario = db
    .prepare("SELECT id, email, nome, criado_em FROM usuarios WHERE id = ?")
    .get(req.usuario.id);
  if (!usuario)
    return res.status(404).json({ erro: "Usuario nao encontrado." });
  return res.json({ ok: true, usuario });
});

// ============================================================
// FUNCAO AUXILIAR: gerar + salvar + enviar o codigo
// ============================================================
async function enviarCodigo(usuarioId, email, nome) {
  // Invalida codigos antigos
  db.prepare(
    "UPDATE codigos_verificacao SET usado = 1 WHERE usuario_id = ? AND usado = 0",
  ).run(usuarioId);

  const codigo = gerarCodigo();
  const codigoHash = bcrypt.hashSync(codigo, 10);
  const minutos = Number(process.env.CODE_EXPIRA_MINUTOS || 10);

  db.prepare(
    `INSERT INTO codigos_verificacao (usuario_id, codigo_hash, tipo, expira_em)
     VALUES (?, ?, 'verificacao', datetime('now', '+' || ? || ' minutes'))`,
  ).run(usuarioId, codigoHash, minutos);

  await enviarCodigoVerificacao(email, codigo, nome);

  // Mostra o codigo no console (util em desenvolvimento)
  console.log(`[auth] Codigo de verificacao para ${email}: ${codigo}`);
}

async function enviarCodigoRecuperacaoCodigo(usuarioId, email, nome) {
  db.prepare(
    "UPDATE codigos_verificacao SET usado = 1 WHERE usuario_id = ? AND tipo = 'recuperacao' AND usado = 0",
  ).run(usuarioId);

  const codigo = gerarCodigo();
  const codigoHash = bcrypt.hashSync(codigo, 10);
  const minutos = Number(process.env.CODE_EXPIRA_MINUTOS || 10);
  db.prepare(
    `INSERT INTO codigos_verificacao (usuario_id, codigo_hash, tipo, expira_em)
     VALUES (?, ?, 'recuperacao', datetime('now', '+' || ? || ' minutes'))`,
  ).run(usuarioId, codigoHash, minutos);

  await enviarCodigoRecuperacao(email, codigo, nome);
  console.log(`[auth] Codigo de recuperacao para ${email}: ${codigo}`);
}

module.exports = router;
