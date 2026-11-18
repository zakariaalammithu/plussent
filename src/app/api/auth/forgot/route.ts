// POST /api/auth/forgot — request a password-reset email (1h token).
// Rate-limited (5/min per IP+email). Always returns the same generic message
// whether the email exists or not — no account enumeration.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  createVerificationToken,
  errorJson,
  getClientIp,
  rateLimit,
} from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { appUrl, brandEmailHtml, sendMail } from "@/lib/mailer";

const forgotSchema = z.object({ email: z.string().email().max(255) });

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = forgotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const email = parsed.data.email.toLowerCase().trim();
  const ip = getClientIp(req);

  const limited = rateLimit(`forgot:${ip}:${email}`, 5, 60_000);
  if (limited) return limited;

  const generic = NextResponse.json({
    ok: true,
    message: "If an account exists for this email, a reset link has been sent.",
  });

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return generic;

  const token = await createVerificationToken(user.id, "password_reset", 60 * 60 * 1000);
  const resetUrl = `${appUrl()}/reset?token=${token}`;
  const mail = await sendMail({
    to: email,
    subject: "Reset your PlusSent password",
    text: `Reset your password by visiting: ${resetUrl}\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
    html: brandEmailHtml(`<p><a href="${resetUrl}">Reset your password</a></p><p>This link expires in 1 hour. If you did not request this, ignore this email.</p>`),
  });
  await auditLog({ userId: user.id, action: "user.password_reset_requested", entity: "user", entityId: user.id });
  // Honest about delivery: when SMTP is not configured the mail was NOT sent.
  return NextResponse.json({
    ok: true,
    message: "If an account exists for this email, a reset link has been sent.",
    resetEmailSent: mail.sent,
    ...(mail.sent ? {} : { resetEmailReason: mail.reason }),
  });
}
