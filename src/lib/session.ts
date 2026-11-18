// Module C session helper for server components — thin wrapper over the
// canonical auth module (src/lib/auth.ts, owned by the auth builder).
// Resolves the ps_session cookie to { user, workspace, sessionId }; the
// workspace is the session workspace, falling back to the user's first
// membership (same fallback as src/lib/api-auth.ts).
import { eq } from "drizzle-orm";
import { getSessionUserFromCookies, getUserMemberships } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces, users } from "@/lib/db/schema";

export interface SessionUser {
  user: typeof users.$inferSelect;
  workspace: typeof workspaces.$inferSelect | null;
  sessionId: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const auth = await getSessionUserFromCookies();
    if (!auth) return null;
    let workspaceId = auth.workspaceId;
    if (!workspaceId) {
      const memberships = await getUserMemberships(auth.user.id);
      workspaceId = memberships[0]?.workspaceId ?? null;
    }
    let workspace: typeof workspaces.$inferSelect | null = null;
    if (workspaceId) {
      const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
      workspace = rows[0] ?? null;
    }
    return { user: auth.user, workspace, sessionId: auth.session.id };
  } catch {
    // DB not initialised / tables missing — treat as unauthenticated, never crash.
    return null;
  }
}

export function isSuperAdmin(s: SessionUser | null): boolean {
  return !!s && s.user.isSuperAdmin === 1;
}
