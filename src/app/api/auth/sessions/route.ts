// /api/auth/sessions — list the user's sessions, revoke one.
// GET: all sessions for the current user (current one flagged).
// DELETE { id }: revoke a single session belonging to the current user.
import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auditLog, errorJson, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, auth.user.id));
  return NextResponse.json({
    ok: true,
    sessions: rows.map((s) => ({
      id: s.id,
      userAgent: s.userAgent,
      ip: s.ip,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === auth.session.id,
    })),
  });
}

const revokeSchema = z.object({ id: z.string().min(1).max(64) });

export async function DELETE(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = revokeSchema.safeParse(body);
  if (!parsed.success) return errorJson("invalid_id", 400);
  const [row] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.id, parsed.data.id), eq(sessions.userId, auth.user.id)))
    .limit(1);
  if (!row) return errorJson("session_not_found", 404);
  await db.delete(sessions).where(eq(sessions.id, parsed.data.id));
  await auditLog({ workspaceId: auth.workspaceId, userId: auth.user.id, action: "user.session_revoked", entity: "session", entityId: parsed.data.id });
  return NextResponse.json({ ok: true });
}
