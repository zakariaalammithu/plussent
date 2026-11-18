// GET /api/analytics — real counts from the DB for this workspace + date range.
// sent/delivered/opened/clicked/replied/bounced/unsubscribed/meetings, plus a
// per-day series. When there is no data the response is zeros/empty — stats
// are NEVER invented or extrapolated.
import { and, count, eq, gte, lte } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getWorkspaceAuth, parseDateParam } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { conversations, emailEvents, emailMessages } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const toMs = parseDateParam(req.nextUrl.searchParams.get("to"), Date.now());
  const fromMs = parseDateParam(
    req.nextUrl.searchParams.get("from"),
    toMs - 30 * DAY_MS,
  );
  const from = Math.min(fromMs, toMs);
  const to = Math.max(fromMs, toMs);

  const wsMessages = and(
    eq(emailMessages.workspaceId, auth.workspaceId),
    gte(emailMessages.createdAt, from),
    lte(emailMessages.createdAt, to),
  );
  const msgRows = await db
    .select({ status: emailMessages.status, n: count() })
    .from(emailMessages)
    .where(wsMessages)
    .groupBy(emailMessages.status);
  const messagesByStatus: Record<string, number> = {};
  for (const r of msgRows) messagesByStatus[r.status] = r.n;

  const wsEvents = and(
    eq(emailEvents.workspaceId, auth.workspaceId),
    gte(emailEvents.createdAt, from),
    lte(emailEvents.createdAt, to),
  );
  const evtRows = await db
    .select({ type: emailEvents.type, n: count() })
    .from(emailEvents)
    .where(wsEvents)
    .groupBy(emailEvents.type);
  const eventsByType: Record<string, number> = {};
  for (const r of evtRows) eventsByType[r.type] = r.n;

  const [meetingRows] = await db
    .select({ n: count() })
    .from(conversations)
    .where(
      and(
        eq(conversations.workspaceId, auth.workspaceId),
        eq(conversations.classification, "meeting_request"),
        gte(conversations.createdAt, from),
        lte(conversations.createdAt, to),
      ),
    );

  const totals = {
    sent: messagesByStatus.sent ?? 0,
    delivered: messagesByStatus.delivered ?? 0,
    opened: messagesByStatus.opened ?? 0,
    clicked: messagesByStatus.clicked ?? 0,
    replied: messagesByStatus.replied ?? 0,
    bounced: messagesByStatus.bounced ?? 0,
    unsubscribed: eventsByType.unsubscribed ?? 0,
    failed: messagesByStatus.failed ?? 0,
    queued: messagesByStatus.queued ?? 0,
    meetings: meetingRows?.n ?? 0,
  };

  // Per-day series (UTC days) from message rows in range, capped at 10k rows.
  const dayRows = await db
    .select({ status: emailMessages.status, createdAt: emailMessages.createdAt })
    .from(emailMessages)
    .where(wsMessages)
    .limit(10_000);
  const byDay = new Map<string, Record<string, number>>();
  for (let d = new Date(from); d.getTime() <= to; d = new Date(d.getTime() + DAY_MS)) {
    byDay.set(d.toISOString().slice(0, 10), {});
  }
  for (const r of dayRows) {
    const day = new Date(r.createdAt).toISOString().slice(0, 10);
    const bucket = byDay.get(day);
    if (!bucket) continue;
    bucket[r.status] = (bucket[r.status] ?? 0) + 1;
  }
  const series = [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, counts]) => ({ date, ...counts }));

  return NextResponse.json({
    ok: true,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    totals,
    messagesByStatus,
    eventsByType,
    series,
  });
}
