import { NextResponse, type NextRequest } from "next/server";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaceMembers, workspaces } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Super-admin only: list all users with their workspace memberships and plans. Real DB rows only. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.isSuperAdmin !== 1) return NextResponse.json({ error: "super-admin only" }, { status: 403 });
  try {
    const allUsers = await db.select().from(users).orderBy(asc(users.createdAt));
    const members = await db.select().from(workspaceMembers);
    const allWs = await db.select().from(workspaces);
    const wsById = new Map(allWs.map((w) => [w.id, w]));
    const byUser = new Map<string, { workspaceId: string; workspaceName: string; plan: string; role: string }[]>();
    for (const m of members) {
      const w = wsById.get(m.workspaceId);
      const list = byUser.get(m.userId) ?? [];
      list.push({ workspaceId: m.workspaceId, workspaceName: w?.name ?? m.workspaceId, plan: w?.plan ?? "free", role: m.role });
      byUser.set(m.userId, list);
    }
    return NextResponse.json({
      users: allUsers.map((u) => ({
        id: u.id, email: u.email, fullName: u.fullName, status: u.status,
        isSuperAdmin: u.isSuperAdmin === 1, emailVerified: u.emailVerifiedAt !== null,
        totpEnabled: u.totpEnabled === 1, createdAt: u.createdAt,
        workspaces: byUser.get(u.id) ?? [],
      })),
    });
  } catch (e) {
    return NextResponse.json({ error: "database not initialised", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
