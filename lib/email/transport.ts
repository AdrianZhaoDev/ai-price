import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM,
  );
}

export function getEmailTransport(): Transporter {
  if (transporter) return transporter;

  if (isSmtpConfigured()) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: process.env.SMTP_SECURE !== "false",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
    return transporter;
  }

  if (process.env.NODE_ENV !== "production") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
    return transporter;
  }

  throw new Error("SMTP is not configured.");
}

export async function verifyEmailTransport(): Promise<boolean> {
  if (!isSmtpConfigured()) return false;
  return getEmailTransport().verify();
}

export function resetEmailTransportForTests(): void {
  transporter = null;
}
