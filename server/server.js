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

const app = express();

// ---- Middlewares ----
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser()); 


app.use((req, res, next) => {
  const origem = req.headers.origin;
  if (origem === "http://localhost:5500" || origem === "http://127.0.0.1:5500") {
    res.header("Access-Control-Allow-Origin", origem);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ---- Arquivos estaticos (HTML, CSS, JS do frontend) ----
const PASTA_FRONTEND = path.join(__dirname, "..");
app.use(express.static(PASTA_FRONTEND));

// ---- Rotas da API ----
app.use("/api/auth", authRoutes);

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
app.listen(PORT, () => {
  console.log("\n============================================================");
  console.log(`  Servidor rodando em: http://localhost:${PORT}`);
  console.log(`  Login:   http://localhost:${PORT}/cadastro.html`);
  console.log(`  Cadastro: http://localhost:${PORT}/cadastro2.html`);
  console.log("============================================================\n");
});
