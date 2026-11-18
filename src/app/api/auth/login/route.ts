// POST /api/auth/login — email+password, rate-limited (5/min per IP+email),
// failed attempts logged to loginAttempts, TOTP second factor when enabled.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  createSession,
  errorJson,
  getClientIp,
  getUserMemberships,
  logLoginAttempt,
  loginRateLimit,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { decryptSecret, verifyTotp } from "@/lib/crypto";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(128),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  rememberMe: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { email, password, totpCode, rememberMe } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ip = getClientIp(req);

  const limited = loginRateLimit(ip, normalizedEmail);
  if (limited) return limited;

  const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
  // Same work + same generic error whether the user exists or not (no enumeration).
  const passwordOk = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : await verifyPassword(password, "$2b$12$dummyhashdummyhashdummyhashdummyhashdu1");
  if (!user || !passwordOk || user.status !== "active") {
    await logLoginAttempt(normalizedEmail, ip, false);
    return errorJson("invalid_credentials", 401);
  }

  // TOTP second factor.
  if (user.totpEnabled) {
    if (!totpCode) {
      await logLoginAttempt(normalizedEmail, ip, false);
      return NextResponse.json({ error: "totp_required" }, { status: 401 });
    }
    let secret: string | null = null;
    try {
      secret = user.totpSecret ? decryptSecret(user.totpSecret) : null;
    } catch {
      secret = null;
    }
    if (!secret || !verifyTotp(secret, totpCode)) {
      await logLoginAttempt(normalizedEmail, ip, false);
      return errorJson("invalid_totp", 401);
    }
  }

  const memberships = await getUserMemberships(user.id);
  const primaryWorkspaceId = memberships[0]?.workspaceId ?? null;

  const { token } = await createSession({
    userId: user.id,
    workspaceId: primaryWorkspaceId,
    userAgent: req.headers.get("user-agent"),
    ip,
    rememberMe: rememberMe ?? false,
  });
  await logLoginAttempt(normalizedEmail, ip, true);
  await auditLog({ workspaceId: primaryWorkspaceId, userId: user.id, action: "user.login", entity: "user", entityId: user.id });

  const res = NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerifiedAt !== null,
      totpEnabled: user.totpEnabled === 1,
    },
    workspaceId: primaryWorkspaceId,
  });
  return setSessionCookie(res, token, rememberMe ?? false);
}
