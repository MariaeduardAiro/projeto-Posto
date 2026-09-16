
// mailer.js - Envio de e-mails (codigo de verificacao)
//   MAIL_MODE=gmail    -> envia e-mail real pelo Gmail/SMTP
//   MAIL_MODE=ethereal -> gera conta de teste, imprime link no console
// ============================================================

require("dotenv").config();
const nodemailer = require("nodemailer");

let transporter = null;
let mailFrom =
  process.env.MAIL_FROM || "Meu Sistema <nao-responda@meusistema.com>";

// Cria o "transportador" (a conexao de envio) de acordo com o modo
// ------------------------------------------------------------
async function criarTransporter() {
  if (transporter) return transporter;

  if (process.env.MAIL_MODE === "ethereal") {
    // Cria uma conta de teste automaticamente (nao envia e-mail real)
    const contaTeste = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: { user: contaTeste.user, pass: contaTeste.pass },
    });
    console.log(
      "[mailer] Modo ETHEREAL ativo. Conta de teste:",
      contaTeste.user,
    );
  } else {
    // Modo Gmail (ou qualquer SMTP configurado no .env)
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: Number(process.env.MAIL_PORT) || 465,
      secure: Number(process.env.MAIL_PORT) === 465, // porta 465 = conexao segura
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
    console.log(
      "[mailer] Modo GMAIL/SMTP ativo. Usuario:",
      process.env.MAIL_USER,
    );
  }

  return transporter;
}

// ------------------------------------------------------------
// Envia o codigo de verificacao para o e-mail do usuario
// ------------------------------------------------------------
async function enviarCodigoVerificacao(destinatario, codigo, nome) {
  const t = await criarTransporter();

  const html = `
 <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;
              border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
    <div style="background:#4f46e5;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">Confirme seu e-mail</h1>
    </div>
    <div style="padding:28px">
      <p style="font-size:16px;color:#333">Ola${nome ? ", " + nome : ""}!</p>
      <p style="font-size:15px;color:#555">
        Use o codigo abaixo para confirmar sua conta.
        Ele expira em <strong>${process.env.CODE_EXPIRA_MINUTOS || 10} minutos</strong>.
      </p>
      <div style="text-align:center;margin:28px 0">
        <span style="display:inline-block;font-size:34px;letter-spacing:8px;
                     font-weight:bold;color:#4f46e5;background:#f3f4ff;
                     padding:16px 28px;border-radius:10px">${codigo}</span>
      </div>
      <p style="font-size:13px;color:#999">
        Se voce nao solicitou este codigo, ignore este e-mail.
      </p>
    </div>
 </div>`;

  const info = await t.sendMail({
    from: mailFrom,
    to: destinatario,
    subject: "Seu codigo de verificacao",
    html,
    text: `Seu codigo de verificacao e: ${codigo}`,
  });

  // No modo Ethereal, mostra o link para visualizar o e-mail
  const urlPreview = nodemailer.getTestMessageUrl(info);
  if (urlPreview) {
    console.log(
      "\n============================================================",
    );
    console.log("[mailer] E-mail de teste enviado!");
    console.log("[mailer] Visualize o e-mail aqui:");
    console.log("[mailer] " + urlPreview);
    console.log(
      "============================================================\n",
    );
  }

  return info;
}

async function enviarCodigoRecuperacao(destinatario, codigo, nome) {
  const t = await criarTransporter();
  const html = `
 <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;
              border:1px solid #e5e5e5;border-radius:12px;overflow:hidden">
    <div style="background:#4f46e5;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">Recupere sua senha</h1>
    </div>
    <div style="padding:28px">
      <p style="font-size:16px;color:#333">Ola${nome ? ", " + nome : ""}!</p>
      <p style="font-size:15px;color:#555">Use o codigo abaixo para criar uma nova senha. Ele expira em <strong>${process.env.CODE_EXPIRA_MINUTOS || 10} 
      minutos</strong>.</p>
      <div style="text-align:center;margin:28px 0"><span style="display:inline-block;font-size:34px;letter-spacing:8px;font-weight:bold;color:#4f46e5;
      background:#f3f4ff;padding:16px 28px;border-radius:10px">${codigo}</span></div>
      <p style="font-size:13px;color:#999">Se voce nao solicitou esta alteracao, ignore este e-mail.</p>
    </div>
 </div>`;
  const info = await t.sendMail({
    from: mailFrom,
    to: destinatario,
    subject: "Codigo para recuperar sua senha",
    html,
    text: `Seu codigo para recuperar a senha e: ${codigo}`,
  });
  const urlPreview = nodemailer.getTestMessageUrl(info);
  if (urlPreview) console.log("[mailer] Visualize o e-mail de recuperacao:", urlPreview);
  return info;
}

module.exports = {
  enviarCodigoVerificacao,
  enviarCodigoRecuperacao,
  criarTransporter,
};
