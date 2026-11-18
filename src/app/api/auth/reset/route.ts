// POST /api/auth/reset — consume a password-reset token (1h), set new password,
// revoke ALL sessions for the user (stolen-token safety).
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  destroyAllUserSessions,
  errorJson,
  findValidVerificationToken,
  hashPassword,
  markVerificationTokenUsed,
} from "@/lib/auth";
import { db, now } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const resetSchema = z.object({
  token: z.string().min(10).max(128),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { token, password } = parsed.data;
  const row = await findValidVerificationToken(token, "password_reset");
  if (!row) return errorJson("invalid_or_expired_token", 400);

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: now() })
    .where(eq(users.id, row.userId));
  await markVerificationTokenUsed(row.id);
  await destroyAllUserSessions(row.userId);
  await auditLog({ userId: row.userId, action: "user.password_reset", entity: "user", entityId: row.userId });
  return NextResponse.json({ ok: true, message: "Password updated. Please sign in again." });
}
