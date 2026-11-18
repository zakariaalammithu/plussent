// PlaseSent — per-account SMTP helpers (Module B).
// Sending accounts store their SMTP credentials encrypted (AES-256-GCM).
// These helpers decrypt server-side only, verify connections, and send one
// message through a specific account. Credentials are never returned or logged.
import nodemailer from "nodemailer";
import { decryptSecret } from "./crypto";
import type { emailAccounts } from "./db/schema";

export interface SmtpCreds {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export type EmailAccountRow = typeof emailAccounts.$inferSelect;

/** Account row without the encrypted credentials field. */
export function serializeAccount(row: EmailAccountRow) {
  const { encryptedCredentials: _creds, ...rest } = row;
  void _creds;
  return rest;
}

export function decryptAccountCreds(row: EmailAccountRow): SmtpCreds {
  return JSON.parse(decryptSecret(row.encryptedCredentials)) as SmtpCreds;
}

export async function testSmtpConnection(creds: SmtpCreds): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
    await transport.verify();
    transport.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "smtp_verify_failed" };
  }
}

export interface SendViaAccountInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
}

export type SendViaAccountResult =
  | { sent: true; messageId: string }
  | { sent: false; reason: string };

/** Send one email through this account's own SMTP server. */
export async function sendViaAccount(
  account: EmailAccountRow,
  input: SendViaAccountInput,
): Promise<SendViaAccountResult> {
  let creds: SmtpCreds;
  try {
    creds = decryptAccountCreds(account);
  } catch {
    return { sent: false, reason: "stored_credentials_unreadable" };
  }
  try {
    const transport = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: { user: creds.user, pass: creds.pass },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
    const info = await transport.sendMail({
      from: account.displayName ? `"${account.displayName}" <${account.email}>` : account.email,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
    });
    transport.close();
    return { sent: true, messageId: info.messageId ?? "" };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "smtp_error" };
  }
}
