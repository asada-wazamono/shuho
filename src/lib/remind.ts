import nodemailer from "nodemailer";

const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth:
        process.env.SMTP_USER && process.env.SMTP_PASS
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
    })
  : null;

export async function sendReminder(to: string, subject: string, text: string): Promise<boolean> {
  const from = process.env.MAIL_FROM || "noreply@example.com";
  if (!transporter) {
    console.log("[リマインド 未送信] SMTP未設定:", { to, subject, text: text.slice(0, 80) });
    return false;
  }
  try {
    await transporter.sendMail({ from, to, subject, text });
    return true;
  } catch (e) {
    console.error("[リマインド 送信エラー]", e);
    return false;
  }
}
