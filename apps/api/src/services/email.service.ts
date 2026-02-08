import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_USER || !env.SMTP_PASS || !env.SMTP_FROM) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

export async function sendPasswordResetEmail(input: { email: string; token: string }): Promise<void> {
  const resetUrl = `${env.WEB_BASE_URL}/reset-password?token=${encodeURIComponent(input.token)}`;
  const transport = getTransporter();

  if (!transport || !env.SMTP_FROM) {
    console.log('[fluxsolutions][email-stub] Password reset link', {
      email: input.email,
      resetUrl,
    });
    return;
  }

  await transport.sendMail({
    from: env.SMTP_FROM,
    to: input.email,
    subject: 'fluxsolutions password reset',
    text: `Reset your password using this link: ${resetUrl}`,
    html: `<p>Reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}
