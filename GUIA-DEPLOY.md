# 🚀 Guia para publicar o sistema na internet

Este guia explica, passo a passo, como tirar o sistema do seu PC e colocar
ele funcionando como um site de verdade, acessível de qualquer lugar.

---

## 📌 Antes de começar: entenda a diferença

| Hoje (no seu PC)                              | Site de verdade (nuvem)                 |
| --------------------------------------------- | --------------------------------------- |
| Você abre o `iniciar.bat` na mão              | O site fica **ligado 24h** sozinho      |
| O endereço é `localhost:3000`                 | Vira um domínio tipo `meusite.com`      |
| O banco é um arquivo (`sistema.db`) no seu PC | O banco fica guardado na nuvem          |
| As senhas ficam no `.env` do seu PC           | As senhas ficam no painel da hospedagem |

> O `iniciar.bat` **não vai para a hospedagem**. Ele serve só para você testar
> no seu computador durante o desenvolvimento. Isso é normal — todo projeto
> funciona assim.

---

## ✅ O que já foi preparado no projeto

Já deixei o sistema **pronto para hospedar**. Foram feitas estas mudanças:

1. **`app.js`** — agora usa endereço relativo (`/api/...`) automaticamente
   quando está em produção. Funciona no seu PC e no site, sem trocar código.
2. **`server.js`** — o CORS (quem pode chamar a API) agora vem da variável
   `CORS_ORIGINS` no `.env`, e não fica mais "preso" no localhost.
3. **`database.js`** — a pasta do banco agora pode ser configurada com
   `DB_DIR`, para usar o disco persistente da hospedagem.
4. **`render.yaml`** — arquivo que diz ao Render como publicar o site.

---

## 🏠 Passo 1: Colocar o código no GitHub

O GitHub é onde o site vai "buscar" o código. A hospedagem conecta nele.

1. Crie uma conta grátis em [github.com](https://github.com) (se ainda não tem).
2. Crie um repositório novo (botão **New repository**), pode ser privado.
3. No seu PC, abra o terminal na pasta do projeto e rode:

   ```bash
   git init
   git add .
   git commit -m "Sistema de login"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
   git push -u origin main
   ```

> ⚠️ **Importante:** o arquivo `server/.gitignore` já bloqueia o envio do
> `.env` e do banco (`*.db`). **Nunca** mande o `.env` para o GitHub —
> ele tem sua senha de app do Gmail.

---

## ☁️ Passo 2: Criar a hospedagem no Render

O [Render](https://render.com) é grátis e lê o `render.yaml` automaticamente.

1. Crie uma conta em [render.com](https://render.com) (pode entrar com GitHub).
2. Clique em **New +** → **Blueprint**.
3. Selecione o repositório que você criou no Passo 1.
4. O Render vai ler o `render.yaml` e pedir para preencher as **variáveis
   de ambiente**. Preencha com os MESMOS valores do seu `server/.env`:

   | Variável              | Valor                                  |
   | --------------------- | -------------------------------------- |
   | `JWT_SECRET`          | uma chave aleatória bem longa          |
   | `JWT_EXPIRES`         | `7d`                                   |
   | `MAIL_MODE`           | `gmail`                                |
   | `MAIL_HOST`           | `smtp.gmail.com`                       |
   | `MAIL_PORT`           | `465`                                  |
   | `MAIL_USER`           | seu e-mail do Gmail                    |
   | `MAIL_PASS`           | sua senha de app de 16 caracteres      |
   | `MAIL_FROM`           | `"Sistema <nao-responda@meusite.com>"` |
   | `CODE_EXPIRA_MINUTOS` | `10`                                   |
   | `CORS_ORIGINS`        | _(deixe vazio por enquanto)_           |

5. Clique em **Apply**. O Render vai publicar o site e te dar um endereço
   tipo `https://sistema-login.onrender.com`.

> O `NODE_VERSION=22` já está no `render.yaml` porque o banco usa o módulo
> `node:sqlite`, que só existe no Node 22 ou superior.

---

## 🔑 Passo 3: Atualizar o CORS com o domínio real

Depois que o Render te der o endereço (ex.: `https://sistema-login.onrender.com`):

1. No painel do Render, vá em **Environment**.
2. Mude `CORS_ORIGINS` para o seu endereço:
   ```
   https://sistema-login.onrender.com
   ```
   (Se tiver domínio próprio, coloque os dois separados por vírgula.)
3. Salve. O Render reinicia sozinho.

> Na prática, como o próprio Render serve o HTML e a API no mesmo endereço,
> o CORS nem é usado. Ele só importa se você servir o HTML de outro lugar.

---

## 💾 Sobre o banco de dados (ponto de atenção)

Hoje o banco é o **SQLite** (um arquivo). Ele funciona, mas tem uma limitação:
no **plano grátis do Render, o disco é apagado quando o site reinicia** —
ou seja, os cadastros podem se perder.

Você tem duas opções:

### Opção A — Continuar com SQLite (mais simples, para aprender/testar)

- Funciona, mas os dados podem sumir em reinícios no plano grátis.
- Para uso "de verdade", contrate um disco persistente (pago) ou
  um plano que não apague dados.

### Opção B — Trocar para um banco na nuvem (recomendado para o site real)

- Use um **Postgres** grátis (Render, Neon, Supabase...).
- Isso exige trocar o `database.js` e as consultas nas rotas.
- Fica 100% à prova de reinício e aguenta mais gente acessando.

---

## 🔍 Passo 4: Testar o site publicado

1. Abra o endereço `https://SEU-SITE.onrender.com/cadastro.html`.
2. Faça um cadastro de teste.
3. Confira se o e-mail com o código chegou.
4. Faça o login.

> No plano grátis do Render, o site "dorme" após ~15 min sem acesso. O
> primeiro acesso demora uns 30-50 segundos para "acordar". Isso é normal
> e não é erro.

---

## ❓ Problemas comuns

| Sintoma                            | Causa provável                        | Solução                         |
| ---------------------------------- | ------------------------------------- | ------------------------------- |
| `ERR_CONNECTION_REFUSED` no seu PC | O servidor não está rodando           | Abra o `iniciar.bat`            |
| E-mail não chega                   | Senha de app errada ou SMTP bloqueado | Gere nova senha de app no Gmail |
| Site "dormindo" (demora a abrir)   | Plano grátis do Render                | Aguarde ~50s, é normal          |
| Cadastros sumiram após um tempo    | Disco do plano grátis apagou          | Veja "Sobre o banco de dados"   |
| Erro de CORS no console            | `CORS_ORIGINS` não bate com o domínio | Ajuste no painel do Render      |
