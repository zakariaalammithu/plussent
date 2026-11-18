// POST /api/auth/change-password — change password for a signed-in user.
// Verifies the current password with bcryptjs, hashes the new one (min 8
// chars), and revokes ALL OTHER sessions for the user — the current session
// stays alive so the user is not kicked out mid-action.
import { and, eq, ne } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  auditLog,
  errorJson,
  hashPassword,
  requireAuth,
  verifyPassword,
} from "@/lib/auth";
import { db, now } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;
  if (!auth.user.passwordHash || !(await verifyPassword(currentPassword, auth.user.passwordHash))) {
    return errorJson("invalid_current_password", 401);
  }
  if (currentPassword === newPassword) {
    return errorJson("new_password_must_differ", 400);
  }
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: now() })
    .where(eq(users.id, auth.user.id));
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, auth.user.id), ne(sessions.id, auth.session.id)));
  await auditLog({ workspaceId: auth.workspaceId, userId: auth.user.id, action: "user.password_changed", entity: "user", entityId: auth.user.id });
  return NextResponse.json({ ok: true, message: "Password changed. Other sessions were signed out." });
}
