import { NextResponse, type NextRequest } from "next/server";
import { count, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { aiUsage, campaigns, emailMessages, leads, subscriptions, users, workspaces } from "@/lib/db/schema";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Super-admin only: real platform-wide counts. No fake data — zeros mean zero. */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  if (auth.user.isSuperAdmin !== 1) return NextResponse.json({ error: "super-admin only" }, { status: 403 });
  try {
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const [u, w, l, c, m, s] = await Promise.all([
      db.select({ n: count() }).from(users),
      db.select({ n: count() }).from(workspaces),
      db.select({ n: count() }).from(leads),
      db.select({ n: count() }).from(campaigns),
      db.select({ n: count() }).from(emailMessages),
      db.select({ n: count() }).from(subscriptions).where(eq(subscriptions.status, "active")),
    ]);
    const aiToday = await db.select({ n: count() }).from(aiUsage).where(gte(aiUsage.createdAt, dayAgo));
    const planRows = await db.select({ plan: workspaces.plan, n: count() }).from(workspaces).groupBy(workspaces.plan);
    const plans: Record<string, number> = {};
    for (const r of planRows) plans[r.plan] = r.n;
    return NextResponse.json({
      users: u[0]?.n ?? 0,
      workspaces: w[0]?.n ?? 0,
      leads: l[0]?.n ?? 0,
      campaigns: c[0]?.n ?? 0,
      emailMessages: m[0]?.n ?? 0,
      activeSubscriptions: s[0]?.n ?? 0,
      aiCallsLast24h: aiToday[0]?.n ?? 0,
      workspacesByPlan: plans,
    });
  } catch (e) {
    return NextResponse.json({ error: "database not initialised", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
