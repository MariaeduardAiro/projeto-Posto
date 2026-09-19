// ============================================================
// ia.js - Reconhecimento de imagem + resposta inteligente
// ------------------------------------------------------------
// Fluxo:
//   1) A imagem da carteira vai DIRETO para o Gemini (ele le
//      imagem nativamente: letra de mao, carimbos, tabelas)
//   2) O Gemini usa o documento de referencia (documento-referencia.md)
//      e responde o que falta / esta atrasado / efeitos / importancia
//
// Usamos fetch nativo (Node 18+), entao NAO ha SDK para instalar.
// ============================================================

require("dotenv").config();
const fs = require("fs");
const path = require("path");

// ---- Configuracoes vindas do .env ----
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODELO = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const CAMINHO_DOCUMENTO = path.join(__dirname, "documento-referencia.md");

// ---- Limite de tamanho da imagem (o frontend tambem corta) ----
const TAMANHO_MAXIMO_BYTES = 10 * 1024 * 1024; // 10 MB

// ============================================================
// 1) LE O DOCUMENTO DE REFERENCIA
// ============================================================
function lerDocumentoReferencia() {
  try {
    if (!fs.existsSync(CAMINHO_DOCUMENTO)) return "";
    return fs.readFileSync(CAMINHO_DOCUMENTO, "utf8");
  } catch (e) {
    console.error("[ia] falha ao ler documento:", e.message);
    return "";
  }
}

// ============================================================
// 2) ANALISE COM O GEMINI (le a imagem + o documento)
// ------------------------------------------------------------
// Recebe os bytes da imagem (Buffer), o tipo MIME e a pergunta
// opcional. Monta o prompt junto com o documento de referencia
// e retorna o texto gerado pelo modelo.
// ============================================================
async function analisarComGemini(bufferImagem, mime, pergunta) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY nao configurada no .env do servidor.");
  }

  const documento = lerDocumentoReferencia();

  // Instrucoes (regras) para a IA seguir
  const instrucoes = `Você é um assistente que ajuda pessoas a entenderem a carteira de
vacinação (Calendário Nacional de Vacinação do Brasil, do PNI).

Você receberá:
- Uma IMAGEM de uma carteira de vacinação (pode ter letra de mão, carimbos,
  estar borrada ou parcialmente ilegível).
- Um DOCUMENTO DE REFERÊNCIA com o calendário e informações oficiais.
- Uma PERGUNTA opcional do usuário.

Primeiro, leia com atenção a imagem e extraia o que conseguir: nomes das
vacinas, datas de aplicação, doses, lote. Se algo estiver ilegível, diga.

Depois responda em português do Brasil, de forma clara, organizada e educativa.
Sempre que possível use títulos curtos e listas. Inclua, quando fizer sentido:
1. O que foi possível ler na carteira (vacinas identificadas e datas).
2. Vacinas que parecem estar EM ATRASO ou faltando, comparando com o calendário.
3. Cuidados com possíveis EFEITOS COLATERAIS e sinais de alerta.
4. A IMPORTÂNCIA de manter a vacinação e de atualizar a carteira.
5. Campanhas de vacinação atuais que podem ser relevantes.


Se o texto estiver ilegível ou vazio, diga isso e peça uma foto mais nítida,
listando o que a pessoa deve conferir. NUNCA invente vacinas que não aparecem
no texto. Se a pergunta do usuário existir, responda-a diretamente usando o
documento de referência.

=== DOCUMENTO DE REFERÊNCIA ===
${documento || "(documento de referência indisponível)"}

A carteira de vacinação está na IMAGEM anexada a esta mensagem.

=== PERGUNTA DO USUÁRIO ===
${pergunta || "(nenhuma pergunta específica — faça a análise completa)"}`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${GEMINI_MODELO}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  // A imagem vai junto com o texto, no mesmo "turno" da conversa.
  // inline_data = dados da imagem embutidos na requisicao (base64).
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: instrucoes },
            {
              inline_data: {
                mime_type: mime || "image/jpeg",
                data: bufferImagem.toString("base64"),
              },
            },
          ],
        },
      ],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
  });

  const json = await resp.json().catch(() => null);

  if (!resp.ok) {
    const detalhe = json?.error?.message || `HTTP ${resp.status}`;
    throw new Error("Falha na resposta (Gemini): " + detalhe);
  }

  const candidato = json?.candidates?.[0];
  const partes = candidato?.content?.parts || [];
  const texto = partes
    .map((p) => p.text || "")
    .join("")
    .trim();

  if (!texto) {
    const motivo = candidato?.finishReason || "sem conteudo";
    throw new Error("A IA não retornou texto (" + motivo + ").");
  }

  return texto;
}

// ============================================================
// 3) FUNCAO PRINCIPAL
// ------------------------------------------------------------
// bufferImagem: Buffer com os bytes da imagem
// mime: tipo da imagem (ex: "image/jpeg")
// pergunta: string opcional
// ============================================================
async function analisarCarteira(bufferImagem, mime, pergunta) {
  if (!Buffer.isBuffer(bufferImagem) || bufferImagem.length === 0) {
    throw new Error("Imagem ausente ou vazia.");
  }
  if (bufferImagem.length > TAMANHO_MAXIMO_BYTES) {
    throw new Error("Imagem muito grande (máximo 10 MB).");
  }

  const resposta = await analisarComGemini(
    bufferImagem,
    mime || "image/jpeg",
    pergunta,
  );
  return { resposta };
}

// Reutiliza a imagem e a analise ja salva para responder novas duvidas.
async function perguntarSobreCarteira(bufferImagem, mime, pergunta, analiseBase, historico = []) {
  if (!pergunta || !pergunta.trim()) throw new Error("Digite uma pergunta.");
  const conversasAnteriores = historico
    .map((item) => `Pergunta: ${item.pergunta}\nResposta: ${item.resposta}`)
    .join("\n\n");
  const perguntaComContexto =
    `ANALISE JA SALVA:\n${analiseBase}\n\n` +
    `CONVERSA ANTERIOR:\n${conversasAnteriores || "(nenhuma)"}\n\n` +
    `NOVA PERGUNTA: ${pergunta}\n\n` +
    "Responda somente a nova pergunta usando a imagem, a analise salva e a conversa anterior. Nao repita toda a analise, a menos que seja necessario.";
  return analisarComGemini(bufferImagem, mime, perguntaComContexto);
}

module.exports = {
  analisarCarteira,
  analisarComGemini,
  perguntarSobreCarteira,
  lerDocumentoReferencia,
};
