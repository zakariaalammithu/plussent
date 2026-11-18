// PlusSent mailer — transactional email via SMTP (nodemailer).
// Sends ONLY when SMTP_HOST is configured. Otherwise it logs and returns
// { sent: false, reason: "smtp_not_configured" } — it NEVER pretends an
// email was sent. Callers must surface that honestly to the user.
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendMailResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

let transporter: Transporter | null = null;

export function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter(): Transporter | null {
  if (!smtpConfigured()) return null;
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  return transporter;
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const transport = getTransporter();
  if (!transport) {
    console.warn(
      `[plussent] mailer: SMTP not configured — email to ${input.to} NOT sent (subject: ${input.subject})`,
    );
    return { sent: false, reason: "smtp_not_configured" };
  }
  try {
    const info = await transport.sendMail({
      from: process.env.SMTP_FROM ?? "noreply@plussent.com",
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { sent: true, messageId: info.messageId ?? "" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "smtp_error";
    console.error(`[plussent] mailer: failed to send to ${input.to}:`, reason);
    return { sent: false, reason };
  }
}

/** Absolute app URL, used to build verification / reset links. */
export function appUrl(): string {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Branded HTML wrapper for transactional emails — official PlusSent logo
 * (white-background asset, so it sits on a white tile) + footer. Plain-text
 * bodies are unchanged; the logo is a remote image, so clients that block
 * images still see the full text.
 */
export function brandEmailHtml(bodyHtml: string): string {
  const logoUrl = `${appUrl()}/brand/plussent-logo.png`;
  return `<div style="font-family:system-ui,sans-serif;color:#071525;max-width:560px;margin:0 auto;">` +
    `<div style="padding:16px 0;"><img src="${logoUrl}" alt="PlusSent" width="180" style="display:block;background:#ffffff;border-radius:10px;padding:6px 10px;" /></div>` +
    `<div>${bodyHtml}</div>` +
    `<p style="color:#5b6577;font-size:13px;border-top:1px solid #dfe4ee;padding-top:12px;">© PlusSent · plussent.com</p></div>`;
}
