

## 🔄 Fluxo do sistema

1. `cadastro2.html` → usuário se cadastra
2. Servidor salva (senha criptografada) com `verificado = 0`
3. Servidor gera código de 6 dígitos e envia por e-mail
4. `verificacao.html` → usuário digita o código
5. Código confere → conta passa para `verificado = 1`
6. `cadastro.html` → login liberado (só se verificado)
7. `recuperar-solicitacao.html` → solicita um código para recuperar a senha
8. `recuperar-senha.html` → valida o código e define uma nova senha

---

## 🗂️ Estrutura

```
Desing test/
├── cadastro.html          Login
├── cadastro2.html         Cadastro
├── verificacao.html       Código de verificação
├── area.html              Página protegida (pós-login)
├── app.js                 Frontend (chama a API)
└── server/
    ├── server.js          Servidor Express
    ├── database.js        Conexão + tabelas SQLite
    ├── mailer.js          Envio de e-mails (Nodemailer)
    ├── .env               Configurações secretas
    ├── routes/auth.js     Rotas de autenticação
    └── sistema.db         Banco (criado automaticamente)
```

---

## 🔌 API

| Método | Rota                  | Descrição                        |
| ------ | --------------------- | -------------------------------- |
| POST   | `/api/auth/cadastro`  | Cria conta e envia código        |
| POST   | `/api/auth/verificar` | Confere o código e ativa a conta |
| POST   | `/api/auth/reenviar`  | Reenvia o código                 |
| POST   | `/api/auth/login`     | Login (só se verificado)         |
| POST   | `/api/auth/solicitar-recuperacao` | Solicita código de recuperação |
| POST   | `/api/auth/redefinir-senha` | Redefine a senha com código |
| POST   | `/api/auth/logout`    | Encerra a sessão                 |
| GET    | `/api/auth/eu`        | Dados do usuário logado          |

---

## 🔒 Segurança aplicada

- Senha **nunca** salva em texto puro (bcrypt, custo 12)
- Código de verificação também criptografado
- Código expira em 10 minutos
- Login limitado a 10 tentativas por 15 min por IP (anti força-bruta)
- Token JWT em cookie `httpOnly` (não acessível por JS)
- Mensagem de erro genérica no login (não revela se o e-mail existe)
- Tabela de auditoria registra logins e falhas
- `.env` protegido no `.gitignore`

---
