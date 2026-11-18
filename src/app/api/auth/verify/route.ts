// /api/auth/verify — email verification.
// POST { token } or GET ?token= — marks the email verified, consumes the token.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  errorJson,
  findValidVerificationToken,
  markVerificationTokenUsed,
} from "@/lib/auth";
import { db, now } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const verifySchema = z.object({ token: z.string().min(10).max(128) });

async function verifyToken(token: string) {
  const row = await findValidVerificationToken(token, "email_verify");
  if (!row) return errorJson("invalid_or_expired_token", 400);
  await db
    .update(users)
    .set({ emailVerifiedAt: now(), updatedAt: now() })
    .where(eq(users.id, row.userId));
  await markVerificationTokenUsed(row.id);
  await auditLog({ userId: row.userId, action: "user.email_verified", entity: "user", entityId: row.userId });
  return NextResponse.json({ ok: true, message: "Email verified." });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return errorJson("invalid_token", 400);
  return verifyToken(parsed.data.token);
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return errorJson("invalid_token", 400);
  return verifyToken(token);
}
