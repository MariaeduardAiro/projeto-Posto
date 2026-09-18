/* ============================================================
   app.js - Frontend (conecta com o backend via API)
   ------------------------------------------------------------
   Toda a verificacao de e-mail/senha e feita no SERVIDOR.
   Aqui so coletamos os dados e mostramos as respostas.
   ============================================================ */

// ---------- Helpers de UI ----------
function mostrar(msg, tipo = "erro") {
  const el = document.getElementById("mensagem");
  if (!el) {
    alert(msg);
    return;
  }
  // Limpa qualquer link antigo para nao acumular mensagens
  el.innerHTML = "";
  el.textContent = msg;
  el.style.color = tipo === "ok" ? "#16a34a" : "#dc2626";
  el.style.display = "block";
}

function esconderMsg() {
  const el = document.getElementById("mensagem");
  if (el) {
    el.style.display = "none";
    el.innerHTML = "";
  }
}

function mostrarComLink(msg, tipo, texto, destino) {
  mostrar(msg, tipo);
  const el = document.getElementById("mensagem");
  if (!el) return;
  const link = document.createElement("a");
  link.href = destino;
  link.textContent = texto;
  link.style.display = "block";
  link.style.marginTop = "12px";
  el.appendChild(link);
}

// Em producao (dominio real) o proprio Express serve o HTML e a API no
// mesmo endereco, entao usamos caminho relativo ("/api/...").
// Durante o desenvolvimento, se a pagina for aberta pelo Live Server
// (porta 5500+) apontamos para a API local na porta 3000. Em qualquer
// outra porta (inclusive 80/443 da hospedagem) usamos relativo.
const API_BASE_URL = (() => {
  const porta = window.location.port;
  // Live Server do VS Code (5500, 5501, ...) -> API local
  if (porta === "5500" || porta === "5501") return "http://127.0.0.1:3000";
  // Servido pelo proprio Express ou por uma hospedagem -> relativo
  return "";
})();

function apiUrl(caminho) {
  return `${API_BASE_URL}${caminho}`;
}

function definirCarregando(ativo) {
  const botao = document.querySelector("#Cadastrar button");
  if (!botao) return;
  botao.disabled = ativo;
  botao.dataset.textoOriginal ||= botao.textContent;
  botao.textContent = ativo ? "Enviando..." : botao.dataset.textoOriginal;
}

function mostrarContinuarVerificacao(email) {
  const area = document.getElementById("continuar-verificacao");
  const link = document.getElementById("link-verificacao");
  if (!area || !link) return;
  const destino = new URL("verificacao.html", window.location.href);
  destino.searchParams.set("email", email);
  link.href = destino.href;
  area.style.display = "block";
}

// ---------- CADASTRO ----------
async function cadastrar() {
  esconderMsg();
  definirCarregando(true);
  const dados = {
    nome: document.getElementById("nome")?.value.trim() || "",
    email: document.getElementById("email").value.trim(),
    senha: document.getElementById("senha").value,
    confirmar: document.getElementById("confirmar").value,
  };

  try {
    const controlador = new AbortController();
    const limite = setTimeout(() => controlador.abort(), 30000);
    const resp = await fetch(apiUrl("/api/auth/cadastro"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
      signal: controlador.signal,
    });
    clearTimeout(limite);

    const textoResposta = await resp.text();
    let json;
    try {
      json = JSON.parse(textoResposta);
    } catch {
      throw new Error(`Resposta inválida do servidor (HTTP ${resp.status})`);
    }

    if (!resp.ok) return mostrar(json.erro || "Erro ao cadastrar.");

    const emailPendente = json.email || dados.email;
    sessionStorage.setItem("emailPendente", emailPendente);
    const destino = new URL("verificacao.html", window.location.href);
    destino.searchParams.set("email", emailPendente);
    window.location.assign(destino.href);
  } catch (e) {
    console.error(e);
    const mensagemErro = e.name === "AbortError"
      ? "O servidor demorou para responder. Verifique se o Node está rodando."
      : "Não foi possível concluir o cadastro: " + e.message;
    mostrar(mensagemErro);
    const fallback = document.getElementById("verificacao-direta");
    if (fallback) fallback.style.display = "block";
  } finally {
    definirCarregando(false);
  }
}

async function verificarCadastro() {
  const email = sessionStorage.getItem("emailPendente") || document.getElementById("email")?.value.trim();
  const codigo = document.getElementById("codigo-cadastro")?.value.trim();
  const mensagem = document.getElementById("mensagem-verificacao");

  if (!email || !codigo) {
    if (mensagem) {
      mensagem.textContent = "Informe o código recebido.";
      mensagem.style.display = "block";
    }
    return;
  }

  try {
    const resp = await fetch(apiUrl("/api/auth/verificar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, codigo }),
    });
    const json = await resp.json();
    if (!resp.ok) throw new Error(json.erro || "Código inválido.");

    if (mensagem) {
      mensagem.textContent = "E-mail verificado! Agora você já pode fazer login.";
      mensagem.style.color = "#16a34a";
      mensagem.style.display = "block";
    }
    sessionStorage.removeItem("emailPendente");
    window.location.assign("cadastro.html");
  } catch (e) {
    if (mensagem) {
      mensagem.textContent = e.message;
      mensagem.style.color = "#dc2626";
      mensagem.style.display = "block";
    }
  }
}

// O formulário também funciona pressionando Enter.
document.addEventListener("DOMContentLoaded", () => {
  const formulario = document.getElementById("form-cadastro");
  if (formulario) formulario.addEventListener("submit", (evento) => {
    evento.preventDefault();
    cadastrar();
  });

  const botaoVerificar = document.getElementById("botao-verificar-cadastro");
  if (botaoVerificar) botaoVerificar.addEventListener("click", verificarCadastro);
});

// ---------- VERIFICACAO ----------
async function verificar() {
  esconderMsg();
  const email =
    document.getElementById("email")?.value.trim() ||
    sessionStorage.getItem("emailPendente") ||
    "";
  const codigo = document.getElementById("codigo").value.trim();

  if (!email) return mostrar("Informe o e-mail.");
  if (!codigo) return mostrar("Digite o codigo recebido.");

  try {
    const resp = await fetch(apiUrl("/api/auth/verificar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, codigo }),
    });
    const json = await resp.json();

    if (!resp.ok) return mostrar(json.erro || "Codigo invalido.");

      mostrarComLink(json.mensagem, "ok", "Continuar para entrar", "cadastro.html");
    sessionStorage.removeItem("emailPendente");
    window.location.assign("cadastro.html");
  } catch (e) {
    console.error(e);
    mostrar("Nao foi possivel conectar ao servidor.");
  }
}

// ---------- REENVIAR CODIGO ----------
async function reenviar() {
  esconderMsg();
  const email =
    document.getElementById("email")?.value.trim() ||
    sessionStorage.getItem("emailPendente") ||
    "";
  if (!email) return mostrar("Informe o e-mail.");

  try {
    const resp = await fetch(apiUrl("/api/auth/reenviar"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await resp.json();
    mostrar(json.erro || json.mensagem, resp.ok ? "ok" : "erro");
  } catch (e) {
    console.error(e);
    mostrar("Nao foi possivel conectar ao servidor.");
  }
}

// ---------- LOGIN ----------
async function entrar() {
  esconderMsg();
  const dados = {
    email: document.getElementById("email").value.trim(),
    senha: document.getElementById("senha").value,
  };

  if (!dados.email || !dados.senha)
    return mostrar("Preencha o e-mail e a senha!");

  try {
    const resp = await fetch(apiUrl("/api/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await resp.json();

    if (!resp.ok) {
      if (json.naoVerificado) {
        sessionStorage.setItem("emailPendente", json.email || dados.email);
        mostrarComLink(json.erro, "erro", "Continuar para verificar o e-mail", "verificacao.html");
        return;
      }
      return mostrar(json.erro || "E-mail ou senha incorretos.");
    }

    sessionStorage.setItem("usuarioLogado", JSON.stringify(json.usuario));
    mostrarComLink(json.mensagem, "ok", "Continuar para a página inicial", "pagina-vazia.html");
    window.location.assign("pagina-vazia.html");
  } catch (e) {
    console.error(e);
    mostrar("Nao foi possivel conectar ao servidor.");
  }
}

// ---------- RECUPERACAO DE SENHA ----------
async function solicitarRecuperacao() {
  esconderMsg();
  const email = document.getElementById("email").value.trim();
  if (!email) return mostrar("Informe o e-mail.");

  try {
    const resp = await fetch(apiUrl("/api/auth/solicitar-recuperacao"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const json = await resp.json();
    if (!resp.ok) return mostrar(json.erro || "Nao foi possivel solicitar a recuperacao.");
    sessionStorage.setItem("emailRecuperacao", json.email || email);
    sessionStorage.setItem("mensagemRecuperacao", json.mensagem);
    const camposRedefinicao = document.getElementById("campos-redefinicao");
    if (camposRedefinicao) {
      mostrar(json.mensagem, "ok");
      camposRedefinicao.hidden = false;
      return;
    }
    window.location.href = "recuperar-senha.html";
  } catch (e) {
    console.error(e);
    mostrar("Nao foi possivel conectar ao servidor.");
  }
}

async function redefinirSenha() {
  esconderMsg();
  const dados = {
    email: document.getElementById("email")?.value.trim() || sessionStorage.getItem("emailRecuperacao") || "",
    codigo: document.getElementById("codigo").value.trim(),
    senha: document.getElementById("senha").value,
    confirmar: document.getElementById("confirmar").value,
  };
  if (!dados.email || !dados.codigo) return mostrar("Informe o e-mail e o codigo.");

  try {
    const resp = await fetch(apiUrl("/api/auth/redefinir-senha"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dados),
    });
    const json = await resp.json();
    if (!resp.ok) return mostrar(json.erro || "Nao foi possivel redefinir a senha.");
    sessionStorage.removeItem("emailRecuperacao");
    mostrarComLink(json.mensagem, "ok", "Voltar para o login", "cadastro.html");
  } catch (e) {
    console.error(e);
    mostrar("Nao foi possivel conectar ao servidor.");
  }
}

Object.assign(window, {
  cadastrar,
  verificar,
  reenviar,
  entrar,
  solicitarRecuperacao,
  redefinirSenha,
});

/* ============================================================
   LIGACAO AUTOMATICA DOS BOTOES
   ------------------------------------------------------------
   Em vez de depender apenas do atributo onclick="funcao()",
   aqui conectamos os botoes pelo TEXTO via addEventListener.
   Isso garante que o clique funcione mesmo se o escopo global
   das funcoes falhar por algum motivo.
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  // Mapa: texto do botao (minusculo) -> funcao a executar
  const acoes = {
    "cadastrar": window.cadastrar,
    "entrar": window.entrar,
    "verificar": window.verificar,
    "reenviar codigo": window.reenviar,
    "enviar codigo": window.solicitarRecuperacao,
    "redefinir senha": window.redefinirSenha,
  };

  document.querySelectorAll("button").forEach((btn) => {
    const texto = (btn.textContent || "").trim().toLowerCase();
    const acao = acoes[texto];
    if (acao) {
      // Remove o onclick inline para nao executar duas vezes
      btn.removeAttribute("onclick");
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        acao();
      });
    }
  });
});
