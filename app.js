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
// Durante o desenvolvimento, se a pagina for aberta por um servidor local
// diferente da API (Live Server ou similar), apontamos para a API na porta
// 3000. Mantemos o mesmo hostname (localhost ou 127.0.0.1) para que o cookie
// de sessao acompanhe as chamadas da IA.
const API_BASE_URL = (() => {
  const porta = window.location.port;
  const hostLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (hostLocal && porta && porta !== "3000") {
    return `http://${window.location.hostname}:3000`;
  }
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
      credentials: "include",
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
      credentials: "include",
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
      credentials: "include",
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
      credentials: "include",
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
      credentials: "include",
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
      credentials: "include",
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
      credentials: "include",
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

// ============================================================
// ANALISE DA CARTEIRA DE VACINACAO POR IA
// ------------------------------------------------------------
// 1) pega a imagem escolhida no <input type="file">
// 2) redimensiona no navegador (evita enviar arquivo gigante)
// 3) converte para base64 e manda para /api/ia/analisar
// 4) mostra a resposta da IA (com "/" quebra de linha)
// ============================================================
async function analisarCarteira() {
  const resultado = document.getElementById("resultado");
  const status = document.getElementById("status-ia");
  const botao = document.getElementById("botao-analisar");
  const arquivo = document.getElementById("Imagem")?.files?.[0];
  const pergunta = document.getElementById("Pergunta")?.value.trim() || "";

  const definirStatus = (texto, cor) => {
    if (!status) return;
    status.textContent = texto;
    status.style.color = cor || "#333";
    status.style.display = "block";
  };

  if (!arquivo) {
    definirStatus("Escolha a foto da carteira primeiro.", "#dc2626");
    return;
  }

  if (botao) botao.disabled = true;
  if (resultado) resultado.textContent = "";
  definirStatus("Enviando e analisando com IA... isso pode levar alguns segundos.", "#333");

  try {
    const imagemBase64 = await prepararImagem(arquivo);

    const resp = await fetch(apiUrl("/api/ia/analisar"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imagem: imagemBase64, pergunta }),
    });

    const json = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      definirStatus(json.erro || "Não foi possível analisar a imagem.", "#dc2626");
      return;
    }

    definirStatus("Análise concluída!", "#16a34a");
    if (resultado) {
      // textContent preserva quebras de linha do texto gerado pela IA
      resultado.textContent = json.resposta || "(a IA não retornou resposta)";
    }
    mostrarCarteiraSalva({ imagem: imagemBase64, resposta: json.resposta, pergunta });
  } catch (e) {
    console.error(e);
    definirStatus("Erro ao analisar: " + e.message, "#dc2626");
  } finally {
    if (botao) botao.disabled = false;
  }
}

// Le o arquivo e devolve um data URL em base64, redimensionando
// a imagem para no maximo 1600px no maior lado (economiza banda).
function prepararImagem(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
      img.onload = () => {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const escala = Math.min(MAX / width, MAX / height);
          width = Math.round(width * escala);
          height = Math.round(height * escala);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        // JPEG com qualidade 0.85 (bom tamanho x legibilidade)
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

let conversaAtual = [];

function mostrarCarteiraSalva(carteira) {
  const preview = document.getElementById("preview");
  const resultado = document.getElementById("resultado");
  const pergunta = document.getElementById("Pergunta");
  const excluir = document.getElementById("botao-excluir-carteira");
  if (preview && carteira.imagem) preview.src = carteira.imagem;
  if (resultado) resultado.textContent = carteira.resposta || "";
  if (pergunta && carteira.pergunta) pergunta.value = carteira.pergunta;
  if (excluir) excluir.hidden = false;
  // Perguntas sao apenas da sessao atual; nunca reaparecem ao atualizar.
  renderizarPerguntas(conversaAtual);
}

function renderizarPerguntas(perguntas) {
  const resultado = document.getElementById("resultado-pergunta");
  const limpar = document.getElementById("botao-limpar-perguntas");
  if (!resultado) return;
  resultado.replaceChildren();
  perguntas.forEach((item) => {
    const pergunta = document.createElement("p");
    pergunta.textContent = `Voce: ${item.pergunta}`;
    const resposta = document.createElement("p");
    resposta.textContent = `IA: ${item.resposta}`;
    resultado.append(pergunta, resposta);
  });
  if (limpar) limpar.hidden = perguntas.length === 0;
}

async function perguntarSobreCarteira() {
  const campo = document.getElementById("Pergunta");
  const botao = document.getElementById("botao-perguntar");
  const status = document.getElementById("status-ia");
  const pergunta = campo?.value.trim() || "";
  if (!pergunta) {
    if (status) {
      status.textContent = "Digite uma pergunta para a IA.";
      status.style.display = "block";
    }
    return;
  }
  if (botao) botao.disabled = true;
  try {
    const resp = await fetch(apiUrl("/api/ia/perguntar"), {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pergunta, historico: conversaAtual.slice(-8) }),
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.erro || "Nao foi possivel responder agora.");

    conversaAtual.push(json.mensagem);
    renderizarPerguntas(conversaAtual);
    if (campo) campo.value = "";
    const limpar = document.getElementById("botao-limpar-perguntas");
    if (limpar) limpar.hidden = false;
  } catch (erro) {
    if (status) {
      status.textContent = erro.message;
      status.style.color = "#dc2626";
      status.style.display = "block";
    }
  } finally {
    if (botao) botao.disabled = false;
  }
}

async function limparPerguntas() {
  const status = document.getElementById("status-ia");
  // Limpa imediatamente a conversa visivel, mesmo se uma limpeza de versoes
  // antigas no servidor falhar. A foto e a analise principal nao sao tocadas.
  conversaAtual = [];
  renderizarPerguntas([]);
  const campo = document.getElementById("Pergunta");
  if (campo) campo.value = "";
  try {
    const resp = await fetch(apiUrl("/api/ia/perguntas"), {
      method: "DELETE",
      credentials: "include",
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.erro || "Nao foi possivel limpar as perguntas.");
    if (status) {
      status.textContent = "Perguntas removidas. A imagem e a analise continuam salvas.";
      status.style.color = "#16a34a";
      status.style.display = "block";
    }
  } catch (erro) {
    if (status) {
      status.textContent = erro.message;
      status.style.color = "#dc2626";
      status.style.display = "block";
    }
  }
}

async function carregarCarteiraSalva() {
  const status = document.getElementById("status-ia");
  try {
    const resp = await fetch(apiUrl("/api/ia/carteira"), { credentials: "include" });
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.carteira) return;
    mostrarCarteiraSalva(json.carteira);
    if (status) {
      status.textContent = "Sua imagem e analise salvas foram carregadas.";
      status.style.color = "#16a34a";
      status.style.display = "block";
    }
  } catch (erro) {
    console.warn("Nao foi possivel carregar a carteira salva.", erro);
  }
}

async function excluirCarteiraSalva() {
  if (!window.confirm("Excluir a imagem e a analise salva? Esta acao nao pode ser desfeita.")) return;

  const status = document.getElementById("status-ia");
  const excluir = document.getElementById("botao-excluir-carteira");
  try {
    const resp = await fetch(apiUrl("/api/ia/carteira"), {
      method: "DELETE",
      credentials: "include",
    });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(json.erro || "Nao foi possivel excluir.");

    const preview = document.getElementById("preview");
    const resultado = document.getElementById("resultado");
    const pergunta = document.getElementById("Pergunta");
    const arquivo = document.getElementById("Imagem");
    if (preview) preview.removeAttribute("src");
    if (resultado) resultado.textContent = "";
    if (pergunta) pergunta.value = "";
    if (arquivo) arquivo.value = "";
    if (excluir) excluir.hidden = true;
    if (status) {
      status.textContent = "Imagem e analise excluidas.";
      status.style.color = "#16a34a";
      status.style.display = "block";
    }
  } catch (erro) {
    if (status) {
      status.textContent = erro.message;
      status.style.color = "#dc2626";
      status.style.display = "block";
    }
  }
}

Object.assign(window, {
  cadastrar,
  verificar,
  reenviar,
  entrar,
  solicitarRecuperacao,
  redefinirSenha,
  analisarCarteira,
  excluirCarteiraSalva,
  perguntarSobreCarteira,
  limparPerguntas,
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

  const excluirCarteira = document.getElementById("botao-excluir-carteira");
  if (excluirCarteira) excluirCarteira.addEventListener("click", excluirCarteiraSalva);
  const perguntar = document.getElementById("botao-perguntar");
  if (perguntar) perguntar.addEventListener("click", perguntarSobreCarteira);
  const limparPerguntasBtn = document.getElementById("botao-limpar-perguntas");
  if (limparPerguntasBtn) limparPerguntasBtn.addEventListener("click", limparPerguntas);
  if (document.getElementById("Imagem")) carregarCarteiraSalva();
});
