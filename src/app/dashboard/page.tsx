import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, conversations, emailAccounts, emailEvents, emailMessages, leads, suppressions } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";

interface Metrics {
  leads: number; accounts: number; campaigns: number;
  sent: number; delivered: number; opened: number; clicked: number;
  replied: number; positive: number; bounced: number; unsubscribed: number; meetings: number;
}

const EMPTY: Metrics = { leads: 0, accounts: 0, campaigns: 0, sent: 0, delivered: 0, opened: 0, clicked: 0, replied: 0, positive: 0, bounced: 0, unsubscribed: 0, meetings: 0 };

/** Fetch /api/analytics (same source of truth as the Analytics page). Returns
 *  null when the route is unavailable — the caller falls back to direct DB counts. */
async function fetchAnalytics(): Promise<{ sent: number; delivered: number; opened: number; clicked: number; replied: number; bounced: number; unsubscribed: number; meetings: number } | null> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return null;
    const proto = h.get("x-forwarded-proto") ?? "http";
    const res = await fetch(`${proto}://${host}/api/analytics`, {
      headers: { cookie: h.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const j = await res.json() as { totals?: Record<string, number>; messagesByStatus?: Record<string, number> };
    const byStatus = j.messagesByStatus ?? {};
    const t = j.totals ?? {};
    return {
      // "Sent" = every message that left the queue (status moved past queued).
      sent: (byStatus.sent ?? 0) + (byStatus.delivered ?? 0) + (byStatus.opened ?? 0) + (byStatus.clicked ?? 0) + (byStatus.replied ?? 0),
      delivered: t.delivered ?? 0,
      opened: t.opened ?? 0,
      clicked: t.clicked ?? 0,
      replied: t.replied ?? 0,
      bounced: t.bounced ?? 0,
      unsubscribed: t.unsubscribed ?? 0,
      meetings: t.meetings ?? 0,
    };
  } catch {
    return null;
  }
}

async function loadMetrics(wsId: string): Promise<{ m: Metrics; dbReady: boolean }> {
  try {
    const [lc, ac, cc] = await Promise.all([
      db.select({ n: count() }).from(leads).where(eq(leads.workspaceId, wsId)),
      db.select({ n: count() }).from(emailAccounts).where(eq(emailAccounts.workspaceId, wsId)),
      db.select({ n: count() }).from(campaigns).where(eq(campaigns.workspaceId, wsId)),
    ]);
    const msgRows = await db
      .select({ status: emailMessages.status, n: count() })
      .from(emailMessages)
      .where(eq(emailMessages.workspaceId, wsId))
      .groupBy(emailMessages.status);
    const byStatus: Record<string, number> = {};
    for (const r of msgRows) byStatus[r.status] = r.n;
    const convRows = await db
      .select({ classification: conversations.classification, n: count() })
      .from(conversations)
      .where(eq(conversations.workspaceId, wsId))
      .groupBy(conversations.classification);
    let positive = 0;
    let meetings = 0;
    for (const r of convRows) {
      if (r.classification === "interested" || r.classification === "positive") positive += r.n;
      if (r.classification === "meeting_request") meetings += r.n;
    }
    const unsub = await db.select({ n: count() }).from(suppressions).where(eq(suppressions.workspaceId, wsId));
    return {
      dbReady: true,
      m: {
        leads: lc[0]?.n ?? 0,
        accounts: ac[0]?.n ?? 0,
        campaigns: cc[0]?.n ?? 0,
        sent: (byStatus.sent ?? 0) + (byStatus.delivered ?? 0) + (byStatus.opened ?? 0) + (byStatus.clicked ?? 0) + (byStatus.replied ?? 0),
        delivered: byStatus.delivered ?? 0,
        opened: byStatus.opened ?? 0,
        clicked: byStatus.clicked ?? 0,
        replied: byStatus.replied ?? 0,
        positive,
        bounced: byStatus.bounced ?? 0,
        unsubscribed: unsub[0]?.n ?? 0,
        meetings,
      },
    };
  } catch {
    return { m: EMPTY, dbReady: false };
  }
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="stat-num">{value.toLocaleString()}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export default async function DashboardPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;
  let { m, dbReady } = wsId ? await loadMetrics(wsId) : { m: EMPTY, dbReady: false };
  // Prefer the analytics API for send metrics when it exists; the DB counts
  // above remain the fallback (and still supply leads/accounts/campaigns/positive).
  if (wsId) {
    const api = await fetchAnalytics();
    if (api) { m = { ...m, ...api }; dbReady = true; }
  }

  let recent: { id: string; type: string; createdAt: number }[] = [];
  let recentCampaigns: { id: string; name: string; status: string }[] = [];
  if (wsId && dbReady) {
    try {
      recent = await db.select({ id: emailEvents.id, type: emailEvents.type, createdAt: emailEvents.createdAt })
        .from(emailEvents).where(eq(emailEvents.workspaceId, wsId)).orderBy(desc(emailEvents.createdAt)).limit(10);
      recentCampaigns = await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.status })
        .from(campaigns).where(eq(campaigns.workspaceId, wsId)).orderBy(desc(campaigns.createdAt)).limit(5);
    } catch { /* keep empty */ }
  }

  const allZero = Object.values(m).every((v) => v === 0);
  const openRate = m.delivered > 0 ? ((m.opened / m.delivered) * 100).toFixed(1) : null;
  const replyRate = m.sent > 0 ? ((m.replied / m.sent) * 100).toFixed(1) : null;

  return (
    <div>
      <div className="app-topbar">
        <h1>Dashboard</h1>
        <span className="muted small">{sess.workspace?.name ?? "No workspace"} · {sess.user.email}</span>
      </div>

      {!dbReady && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>Database not initialised yet.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>
            No tables were found — run the migrations (<code>npm run db:migrate</code>) and the numbers below will fill in from real data. Nothing here is estimated or faked.
          </p>
        </div>
      )}
      {dbReady && allZero && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>No data yet — import leads and launch a campaign.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>
            Your workspace is empty. Import a lead list, connect an email account, then create a campaign to see real numbers here.
          </p>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <Stat label="Leads" value={m.leads} />
        <Stat label="Email accounts" value={m.accounts} />
        <Stat label="Campaigns" value={m.campaigns} />
        <Stat label="Sent" value={m.sent} />
        <Stat label="Delivered" value={m.delivered} />
        <Stat label="Opened" value={m.opened} />
        <Stat label="Clicked" value={m.clicked} />
        <Stat label="Replied" value={m.replied} />
        <Stat label="Positive replies" value={m.positive} />
        <Stat label="Bounced" value={m.bounced} />
        <Stat label="Unsubscribed" value={m.unsubscribed} />
        <Stat label="Meetings" value={m.meetings} />
      </div>

      <div className="grid grid-2" style={{ marginBottom: "1rem" }}>
        <div className="card">
          <h3>Rates (from real events)</h3>
          <p>Open rate: <strong>{openRate === null ? "— (no delivered mail yet)" : `${openRate}%`}</strong></p>
          <p style={{ margin: 0 }}>Reply rate: <strong>{replyRate === null ? "— (nothing sent yet)" : `${replyRate}%`}</strong></p>
        </div>
        <div className="card">
          <h3>Quick actions</h3>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Link href="/leads" className="btn btn-secondary btn-sm">Import leads</Link>
            <Link href="/campaigns" className="btn btn-secondary btn-sm">New campaign</Link>
            <Link href="/inbox" className="btn btn-secondary btn-sm">Open inbox</Link>
            <Link href="/ai" className="btn btn-secondary btn-sm">Ask AI</Link>
            <Link href="/analytics" className="btn btn-secondary btn-sm">View analytics</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Recent activity</h3>
          {recent.length === 0 ? (
            <p className="muted">No email events yet.</p>
          ) : (
            <table>
              <thead><tr><th>Event</th><th>When</th></tr></thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}><td>{e.type}</td><td>{new Date(e.createdAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Recent campaigns</h3>
          {recentCampaigns.length === 0 ? (
            <p className="muted">No campaigns yet. <Link href="/campaigns">Create one</Link>.</p>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Status</th></tr></thead>
              <tbody>
                {recentCampaigns.map((c) => (
                  <tr key={c.id}><td>{c.name}</td><td><span className="badge">{c.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
