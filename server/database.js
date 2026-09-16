
// ============================================================

const { DatabaseSync } = require("node:sqlite");
const path = require("path");

// Abre ou cria o arquivo do banco
const db = new DatabaseSync(path.join(__dirname, "sistema.db"));

// Boas praticas do SQLite
db.exec("PRAGMA journal_mode = WAL;"); // mais rapido e seguro
db.exec("PRAGMA foreign_keys = ON;"); // respeita relacoes entre tabelas


// CRIACAO DAS TABELAS

// Tabela de usuarios
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    nome          TEXT,
    senha_hash    TEXT    NOT NULL,          -- senha criptografada (bcrypt)
    verificado    INTEGER NOT NULL DEFAULT 0, -- 0 = nao, 1 = sim
    criado_em     TEXT    NOT NULL DEFAULT (datetime('now')),
    atualizado_em TEXT
  );
`);

// Tabela de codigos de verificacao (enviados por e-mail)
db.exec(`
  CREATE TABLE IF NOT EXISTS codigos_verificacao (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id  INTEGER NOT NULL,
    codigo_hash TEXT    NOT NULL,           -- codigo tambem e criptografado
    tipo        TEXT    NOT NULL,           -- 'verificacao' | 'recuperacao'
    expira_em   TEXT    NOT NULL,
    usado       INTEGER NOT NULL DEFAULT 0,
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
  );
`);

// Tabela de auditoria (registra tentativas de login, etc.)
db.exec(`
  CREATE TABLE IF NOT EXISTS logs_auditoria (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    acao       TEXT NOT NULL,      -- 'login_ok', 'login_falha', 'cadastro'...
    ip         TEXT,
    detalhes   TEXT,
    criado_em  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
  );
`);

// Indices para deixar as buscas rapidas
db.exec(`CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);`);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_codigos_usuario ON codigos_verificacao(usuario_id);`,
);

module.exports = db;
