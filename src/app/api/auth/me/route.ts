// GET /api/auth/me — current user + their workspace memberships.
import { inArray } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { getUserMemberships, requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const memberships = await getUserMemberships(auth.user.id);
  const wsIds = memberships.map((m) => m.workspaceId);
  const wsList = wsIds.length
    ? await db.select().from(workspaces).where(inArray(workspaces.id, wsIds))
    : [];
  const byId = new Map(wsList.map((w) => [w.id, w]));
  const result = memberships
    .map((m) => {
      const ws = byId.get(m.workspaceId);
      return ws
        ? { id: ws.id, name: ws.name, slug: ws.slug, plan: ws.plan, role: m.role }
        : null;
    })
    .filter((w): w is NonNullable<typeof w> => w !== null);
  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      fullName: auth.user.fullName,
      emailVerified: auth.user.emailVerifiedAt !== null,
      totpEnabled: auth.user.totpEnabled === 1,
      isSuperAdmin: auth.user.isSuperAdmin === 1,
    },
    workspaces: result,
    currentWorkspaceId: auth.workspaceId,
  });
}
