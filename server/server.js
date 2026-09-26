// ============================================================
// server.js - Arquivo principal do servidor
// ------------------------------------------------------------

require("dotenv").config();
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

// Inicializa o banco (cria as tabelas na primeira execucao)
require("./database");

const authRoutes = require("./routes/auth");
const iaRoutes = require("./routes/ia");

const app = express();

// ---- Middlewares ----
// Limite maior (12mb) porque a imagem da carteira vai em base64.
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
app.use(cookieParser());


// Origens permitidas para CORS (separadas por virgula no .env).
// Em producao, coloque o dominio real. Ex.: CORS_ORIGINS=https://meusite.com
const ORIGENS_PERMITIDAS = (process.env.CORS_ORIGINS ||
  "http://localhost:5500,http://127.0.0.1:5500")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// Durante o desenvolvimento, o Live Server do VS Code escolhe QUALQUER porta
// livre (5500, 5501, 5502...) quando a anterior esta em uso. Em vez de exigir
// listar cada uma no .env, liberamos automaticamente localhost/127.0.0.1 em
// qualquer porta. Isso evita que o cookie seja bloqueado -> "Nao autenticado".
function origemLocalDeDesenvolvimento(origem) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem);
}

app.use((req, res, next) => {
  const origem = req.headers.origin;
  const permitida =
    origem &&
    (ORIGENS_PERMITIDAS.includes(origem) ||
      origemLocalDeDesenvolvimento(origem));
  if (permitida) {
    res.header("Access-Control-Allow-Origin", origem);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    // A carteira e as perguntas tambem usam DELETE. Sem esse metodo aqui,
    // navegadores bloqueiam a exclusao quando o frontend roda no Live Server.
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- Arquivos estaticos (HTML, CSS, JS do frontend) ----
const PASTA_FRONTEND = path.join(__dirname, "..");
app.use(express.static(PASTA_FRONTEND));

// ---- Rotas da API ----
app.use("/api/auth", authRoutes);
app.use("/api/ia", iaRoutes);

// Usado pelo navegador, por monitores e pela hospedagem para confirmar que
// o processo ainda esta pronto para atender requisicoes.
app.get("/api/health", (req, res) => {
  res.status(200).json({ ok: true, status: "online" });
});

// ---- Rota raiz ----
app.get("/", (req, res) => {
  res.redirect("/cadastro.html");
});

// ---- Tratamento de erros ----
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor." });
});

// ---- Inicia o servidor ----
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log("\n============================================================");
  console.log(`  Servidor rodando em: http://localhost:${PORT}`);
  console.log(`  Login:   http://localhost:${PORT}/cadastro.html`);
  console.log(`  Cadastro: http://localhost:${PORT}/cadastro2.html`);
  console.log("============================================================\n");
});

// Erros fora de uma requisicao nao devem desaparecer silenciosamente. O
// processo termina de forma previsivel para que o iniciar.bat o suba de novo.
process.on("unhandledRejection", (motivo) => {
  console.error("[process] Promessa nao tratada:", motivo);
});

process.on("uncaughtException", (erro) => {
  console.error("[process] Erro fatal nao tratado:", erro);
  server.close(() => process.exit(1));
  setTimeout(() => process.exit(1), 5_000).unref();
});

function encerrar(sinal) {
  console.log(`\n[process] ${sinal} recebido. Encerrando com seguranca...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 10_000).unref();
}

process.once("SIGINT", () => encerrar("SIGINT"));
process.once("SIGTERM", () => encerrar("SIGTERM"));
