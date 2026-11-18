// PlusSent auth — sessions, passwords, rate limiting, audit logging.
// Opaque session tokens: random 32 bytes, SHA-256 hash stored in DB, raw token
// only ever in the httpOnly "ps_session" cookie. Never log tokens or passwords.
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import type { NextRequest, NextResponse } from "next/server";
import { hashToken, randomToken } from "./crypto";
import { db, makeId, now } from "./db";
import { auditLogs, loginAttempts, sessions, users, verificationTokens, workspaces, workspaceMembers } from "./db/schema";
import { assertWorkspaceAccess, roleAtLeast } from "./tenant";

export const SESSION_COOKIE = "ps_session";
// Default session lifetime: 30 days. remember-me extends to 90 days.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_TTL_REMEMBER_MS = 90 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------- passwords
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

// ---------------------------------------------------------------- sessions
export interface CreateSessionOpts {
  userId: string;
  workspaceId?: string | null;
  userAgent?: string | null;
  ip?: string | null;
  rememberMe?: boolean;
}

export async function createSession(opts: CreateSessionOpts) {
  const token = randomToken(32);
  const ttl = opts.rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS;
  const session = {
    id: makeId("ses"),
    tokenHash: hashToken(token),
    userId: opts.userId,
    workspaceId: opts.workspaceId ?? null,
    userAgent: opts.userAgent ?? null,
    ip: opts.ip ?? null,
    expiresAt: now() + ttl,
    createdAt: now(),
  };
  await db.insert(sessions).values(session);
  return { session, token, expiresAt: session.expiresAt };
}

export function sessionCookieOptions(rememberMe = false) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor((rememberMe ? SESSION_TTL_REMEMBER_MS : SESSION_TTL_MS) / 1000),
  };
}

export function setSessionCookie(res: NextResponse, token: string, rememberMe = false) {
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(rememberMe));
  return res;
}

export function clearSessionCookie(res: NextResponse) {
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}

export async function destroySession(token: string): Promise<void> {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

// ---------------------------------------------------------------- session user
export interface AuthContext {
  user: typeof users.$inferSelect;
  session: typeof sessions.$inferSelect;
  /** Primary workspace for this session (may be null for legacy sessions). */
  workspaceId: string | null;
}

export async function getSessionUserFromToken(token: string): Promise<AuthContext | null> {
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .limit(1);
  if (!session || session.expiresAt < now()) {
    if (session) await db.delete(sessions).where(eq(sessions.id, session.id));
    return null;
  }
  const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
  if (!user || user.status !== "active") return null;
  return { user, session, workspaceId: session.workspaceId };
}

/** Read the session from a route handler request. */
export async function getSessionUser(req: NextRequest): Promise<AuthContext | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? getSessionUserFromToken(token) : null;
}

/** Read the session from next/headers cookies (server components / pages). */
export async function getSessionUserFromCookies(): Promise<AuthContext | null> {
  // next/headers is imported lazily so this module stays importable in plain
  // Node (tests) — it only exists inside the Next.js runtime.
  const { cookies } = await import("next/headers");
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  return token ? getSessionUserFromToken(token) : null;
}

export function errorJson(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

/** Returns AuthContext, or a 401 NextResponse to return directly. */
export async function requireAuth(req: NextRequest): Promise<AuthContext | Response> {
  const auth = await getSessionUser(req);
  if (!auth) return errorJson("unauthorized", 401);
  return auth;
}

/**
 * Require membership in a workspace. Returns AuthContext (with workspaceId set),
 * or a 401 (no session) / 403 (not a member, or role below minRole) Response.
 */
export async function requireWorkspace(
  req: NextRequest,
  workspaceId: string,
  minRole?: "owner" | "admin" | "member" | "viewer",
): Promise<AuthContext | Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const member = await assertWorkspaceAccess(db, auth.user.id, workspaceId);
  if (!member) return errorJson("forbidden", 403);
  if (minRole && !roleAtLeast(member.role, minRole)) return errorJson("forbidden", 403);
  return { ...auth, workspaceId };
}

// ---------------------------------------------------------------- rate limiting
// In-memory fixed-window limiter. Per-process only — adequate for a single
// instance; a distributed store is needed if PlusSent ever runs multi-instance.
const rateLimitStore = new Map<string, number[]>();

/**
 * Pure, testable limiter. Returns true when the hit is allowed (and records it),
 * false when `limit` hits already occurred inside `windowMs`.
 */
export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  at = Date.now(),
): boolean {
  const hits = (rateLimitStore.get(key) ?? []).filter((t) => t > at - windowMs);
  if (hits.length >= limit) {
    rateLimitStore.set(key, hits);
    return false;
  }
  hits.push(at);
  rateLimitStore.set(key, hits);
  return true;
}

/** Test helper — clears all in-memory rate-limit state. */
export function resetRateLimits(): void {
  rateLimitStore.clear();
}

/** Login limiter: 5 attempts/min per IP+email (spec). Returns a 429 Response or null. */
export function loginRateLimit(ip: string, email: string): Response | null {
  const key = `login:${ip}:${email.toLowerCase()}`;
  if (!checkRateLimit(key, 5, 60_000)) {
    return errorJson("too_many_requests", 429);
  }
  return null;
}

/** Generic limiter for forgot-password etc. Returns a 429 Response or null. */
export function rateLimit(key: string, limit: number, windowMs: number): Response | null {
  if (!checkRateLimit(key, limit, windowMs)) {
    return errorJson("too_many_requests", 429);
  }
  return null;
}

// ---------------------------------------------------------------- misc helpers
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function auditLog(input: {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string | null;
  entityId?: string | null;
}): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: makeId("aud"),
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      action: input.action,
      entity: input.entity ?? null,
      entityId: input.entityId ?? null,
      createdAt: now(),
    });
  } catch (err) {
    // Audit logging must never break the request it records.
    console.error("[plussent] auditLog failed", err);
  }
}

/** Create a personal workspace for a new user + make them its owner. */
export async function createPersonalWorkspace(userId: string, name: string) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  let slug = base || "workspace";
  for (let i = 0; i < 10; i++) {
    const candidate = i === 0 ? slug : `${slug}-${i}`;
    const [existing] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.slug, candidate))
      .limit(1);
    if (!existing) {
      slug = candidate;
      break;
    }
  }
  const workspace = {
    id: makeId("ws"),
    name: name || "My Workspace",
    slug,
    ownerId: userId,
    plan: "free",
    createdAt: now(),
    updatedAt: now(),
  };
  await db.insert(workspaces).values(workspace);
  await db.insert(workspaceMembers).values({
    id: makeId("wm"),
    workspaceId: workspace.id,
    userId,
    role: "owner",
    createdAt: now(),
  });
  return workspace;
}

// ---------------------------------------------------------------- TOTP helpers
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Buffer): string {
  let bits = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, "0");
    out += BASE32_ALPHABET[parseInt(chunk, 2)];
  }
  return out;
}

/** Random 160-bit TOTP secret, base32 (RFC 6238). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpAuthUrl(secret: string, email: string, issuer = "PlusSent"): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** Memberships of a user, newest first — used by /api/auth/me. */
export async function getUserMemberships(userId: string) {
  return db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId));
}

// ------------------------------------------------------- verification tokens
export type VerificationKind = "email_verify" | "password_reset";

/** Create a token row; returns the RAW token (only ever sent by email, never stored). */
export async function createVerificationToken(
  userId: string,
  kind: VerificationKind,
  ttlMs: number,
): Promise<string> {
  const token = randomToken(32);
  await db.insert(verificationTokens).values({
    id: makeId("vt"),
    userId,
    kind,
    tokenHash: hashToken(token),
    expiresAt: now() + ttlMs,
    usedAt: null,
    createdAt: now(),
  });
  return token;
}

/** Find a live (unused, unexpired) token row for the raw token + kind. */
export async function findValidVerificationToken(
  token: string,
  kind: VerificationKind,
): Promise<typeof verificationTokens.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.tokenHash, hashToken(token)),
        eq(verificationTokens.kind, kind),
      ),
    )
    .limit(1);
  if (!row || row.usedAt || row.expiresAt < now()) return null;
  return row;
}

export async function markVerificationTokenUsed(id: string): Promise<void> {
  await db.update(verificationTokens).set({ usedAt: now() }).where(eq(verificationTokens.id, id));
}

// ------------------------------------------------------------ login attempts
export async function logLoginAttempt(
  email: string,
  ip: string | null,
  success: boolean,
): Promise<void> {
  try {
    await db.insert(loginAttempts).values({
      id: makeId("la"),
      email: email.toLowerCase(),
      ip,
      success: success ? 1 : 0,
      createdAt: now(),
    });
  } catch (err) {
    console.error("[plussent] logLoginAttempt failed", err);
  }
}
