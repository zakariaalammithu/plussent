// POST /api/auth/signup — create user + personal workspace + owner membership
// + free/trialing subscription in one flow; sends a verification email when
// SMTP is configured (never pretends it was sent when it was not).
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  createPersonalWorkspace,
  createSession,
  createVerificationToken,
  errorJson,
  getClientIp,
  hashPassword,
  setSessionCookie,
} from "@/lib/auth";
import { db, makeId, now } from "@/lib/db";
import { subscriptions, users } from "@/lib/db/schema";
import { appUrl, brandEmailHtml, sendMail } from "@/lib/mailer";

export const dynamic = "force-dynamic";

const signupSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(128),
  fullName: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, password, fullName } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (existing) return errorJson("email_in_use", 409);

  const userId = makeId("usr");
  const user = {
    id: userId,
    email: normalizedEmail,
    passwordHash: await hashPassword(password),
    fullName: fullName?.trim() || null,
    emailVerifiedAt: null,
    totpSecret: null,
    totpEnabled: 0,
    status: "active",
    isSuperAdmin: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(users).values(user);

  const workspaceName = fullName?.trim()
    ? `${fullName.trim()}'s Workspace`
    : normalizedEmail.split("@")[0];
  const workspace = await createPersonalWorkspace(userId, workspaceName);

  await db.insert(subscriptions).values({
    id: makeId("sub"),
    workspaceId: workspace.id,
    plan: "free",
    status: "trialing",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    currentPeriodEnd: null,
    createdAt: now(),
    updatedAt: now(),
  });

  // Email verification (24h). If SMTP is not configured the mailer reports
  // sent:false honestly and the user can re-request verification later.
  const verifyToken = await createVerificationToken(userId, "email_verify", 24 * 60 * 60 * 1000);
  const verifyUrl = `${appUrl()}/verify?token=${verifyToken}`;
  const mail = await sendMail({
    to: normalizedEmail,
    subject: "Verify your PlusSent email",
    text: `Welcome to PlusSent! Verify your email by visiting: ${verifyUrl}\nThis link expires in 24 hours.`,
    html: brandEmailHtml(`<p>Welcome to PlusSent!</p><p><a href="${verifyUrl}">Verify your email</a></p><p>This link expires in 24 hours.</p>`),
  });

  const { token } = await createSession({
    userId,
    workspaceId: workspace.id,
    userAgent: req.headers.get("user-agent"),
    ip: getClientIp(req),
  });
  await auditLog({ workspaceId: workspace.id, userId, action: "user.signup", entity: "user", entityId: userId });

  const res = NextResponse.json(
    {
      ok: true,
      user: { id: user.id, email: user.email, fullName: user.fullName, emailVerified: false },
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      verificationEmailSent: mail.sent,
      ...(mail.sent ? {} : { verificationEmailReason: mail.reason }),
    },
    { status: 201 },
  );
  return setSessionCookie(res, token);
}
