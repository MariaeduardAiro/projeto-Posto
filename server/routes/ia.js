// ============================================================
// routes/ia.js - Rota da analise por IA
// ------------------------------------------------------------
//   POST /api/ia/analisar
//     - exige usuario logado (token JWT no cookie)
//     - recebe { imagem: "data:image/...;base64,...", pergunta: "..." }
//     - devolve { ok, resposta }
// ============================================================

const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const { analisarCarteira, perguntarSobreCarteira } = require("../ia");
const db = require("../database");

const router = express.Router();

// --- Protege a rota (mesma logica do auth.js) ---
function autenticar(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    console.warn("[ia] acesso recusado: cookie de sessao ausente", {
      origin: req.headers.origin || "mesma origem",
    });
    return res.status(401).json({ erro: "Sessao ausente. Entre novamente para usar a IA." });
  }
  try {
    req.usuario = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    console.warn("[ia] acesso recusado: sessao invalida ou expirada", {
      origin: req.headers.origin || "mesma origem",
    });
    return res.status(401).json({ erro: "Sessao invalida ou expirada. Entre novamente." });
  }
}

// --- Limita o uso da IA (evita gastar a cota da API sem controle) ---
const limiteIa = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 15, // no maximo 15 analises por IP a cada 10 min
  message: { erro: "Muitas analises seguidas. Aguarde alguns minutos." },
});

// Extrai os bytes e o tipo MIME de uma string "data:image/...;base64,..."
function decodificarDataUrl(dataUrl) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) {
    throw new Error("Formato de imagem inválido.");
  }
  const match = /^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("Formato de imagem inválido.");

  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new Error("Imagem vazia.");
  return { mime, buffer };
}

router.post("/analisar", autenticar, limiteIa, async (req, res) => {
  try {
    const { imagem, pergunta } = req.body || {};

    if (!imagem)
      return res
        .status(400)
        .json({ erro: "Envie a foto da carteira de vacinação." });

    let mime, buffer;
    try {
      ({ mime, buffer } = decodificarDataUrl(imagem));
    } catch (e) {
      return res.status(400).json({ erro: e.message });
    }

    if (!/^image\/(jpeg|png|webp|bmp|gif)$/.test(mime)) {
      return res
        .status(400)
        .json({ erro: "Formato não suportado. Use JPG, PNG ou WEBP." });
    }

    const { resposta } = await analisarCarteira(buffer, mime, pergunta);

    // Cada nova analise substitui a carteira anterior desta conta.
    db.prepare(
      `INSERT INTO carteiras_salvas (usuario_id, imagem, mime, resposta, pergunta)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(usuario_id) DO UPDATE SET
         imagem = excluded.imagem,
         mime = excluded.mime,
         resposta = excluded.resposta,
         pergunta = excluded.pergunta,
         atualizado_em = datetime('now')`,
    ).run(req.usuario.id, buffer, mime, resposta, pergunta || null);

    return res.json({ ok: true, resposta });
  } catch (err) {
    console.error("[ia] erro:", err.message);
    // Se a chave nao estiver configurada, avisa de forma clara
    if (/API_KEY nao configurada/i.test(err.message)) {
      return res.status(503).json({
        erro:
          "A análise por IA ainda não está configurada. " +
          "Adicione a GEMINI_API_KEY no arquivo server/.env.",
      });
    }
    return res
      .status(500)
      .json({ erro: err.message || "Erro ao analisar a imagem." });
  }
});

// Devolve somente a carteira pertencente ao usuario logado.
router.get("/carteira", autenticar, (req, res) => {
  try {
    const carteira = db
      .prepare(
        `SELECT imagem, mime, resposta, pergunta, atualizado_em
         FROM carteiras_salvas WHERE usuario_id = ?`,
      )
      .get(req.usuario.id);

    res.set("Cache-Control", "no-store");
    if (!carteira) return res.json({ ok: true, carteira: null });

    return res.json({
      ok: true,
      carteira: {
        imagem: `data:${carteira.mime};base64,${Buffer.from(carteira.imagem).toString("base64")}`,
        resposta: carteira.resposta,
        pergunta: carteira.pergunta || "",
        atualizadoEm: carteira.atualizado_em,
      },
    });
  } catch (err) {
    console.error("[ia] falha ao carregar carteira:", err.message);
    return res.status(500).json({ erro: "Nao foi possivel carregar a carteira salva." });
  }
});

// Faz uma nova pergunta usando a imagem e a analise que ja estao salvas.
router.post("/perguntar", autenticar, limiteIa, async (req, res) => {
  try {
    const pergunta = typeof req.body?.pergunta === "string" ? req.body.pergunta.trim() : "";
    if (!pergunta) return res.status(400).json({ erro: "Digite uma pergunta." });
    if (pergunta.length > 2_000) return res.status(400).json({ erro: "A pergunta pode ter no maximo 2000 caracteres." });

    const carteira = db.prepare(
      "SELECT imagem, mime, resposta FROM carteiras_salvas WHERE usuario_id = ?",
    ).get(req.usuario.id);
    if (!carteira) return res.status(404).json({ erro: "Envie e analise uma imagem antes de fazer perguntas." });

    // A conversa e temporaria: vem do navegador e nunca e gravada no banco.
    const historico = Array.isArray(req.body?.historico)
      ? req.body.historico
        .slice(-8)
        .filter((item) => typeof item?.pergunta === "string" && typeof item?.resposta === "string")
        .map((item) => ({ pergunta: item.pergunta.slice(0, 2_000), resposta: item.resposta.slice(0, 8_000) }))
      : [];
    const resposta = await perguntarSobreCarteira(
      Buffer.from(carteira.imagem), carteira.mime, pergunta, carteira.resposta, historico,
    );

    return res.json({
      ok: true,
      mensagem: { pergunta, resposta },
    });
  } catch (err) {
    console.error("[ia] falha ao responder pergunta:", err.message);
    return res.status(500).json({ erro: "Nao foi possivel responder a pergunta agora." });
  }
});

// Limpa a conversa, mas preserva a imagem e a analise principal.
router.delete("/perguntas", autenticar, (req, res) => {
  try {
    db.prepare("DELETE FROM perguntas_ia WHERE usuario_id = ?").run(req.usuario.id);
    return res.json({ ok: true, mensagem: "Perguntas removidas." });
  } catch (err) {
    console.error("[ia] falha ao excluir perguntas:", err.message);
    return res.status(500).json({ erro: "Nao foi possivel excluir as perguntas." });
  }
});

// Apaga junto a imagem e toda a analise associada a ela.
router.delete("/carteira", autenticar, (req, res) => {
  try {
    db.prepare("DELETE FROM perguntas_ia WHERE usuario_id = ?").run(req.usuario.id);
    db.prepare("DELETE FROM carteiras_salvas WHERE usuario_id = ?").run(req.usuario.id);
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true, mensagem: "Imagem e analise removidas." });
  } catch (err) {
    console.error("[ia] falha ao excluir carteira:", err.message);
    return res.status(500).json({ erro: "Nao foi possivel excluir a carteira salva." });
  }
});

module.exports = router;
