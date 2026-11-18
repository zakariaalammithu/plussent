import { redirect } from "next/navigation";
import { count, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailEvents, emailMessages } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

const EVENT_TYPES = ["sent", "delivered", "opened", "clicked", "replied", "bounced", "unsubscribed", "complained"] as const;

export default async function AnalyticsPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;

  let byType: Record<string, number> = {};
  let byStatus: Record<string, number> = {};
  let daily: { date: string; sent: number; opened: number; replied: number }[] = [];
  let dbReady = false;
  if (wsId) {
    try {
      const ev = await db.select({ type: emailEvents.type, n: count() }).from(emailEvents)
        .where(eq(emailEvents.workspaceId, wsId)).groupBy(emailEvents.type);
      for (const r of ev) byType[r.type] = r.n;
      const ms = await db.select({ status: emailMessages.status, n: count() }).from(emailMessages)
        .where(eq(emailMessages.workspaceId, wsId)).groupBy(emailMessages.status);
      for (const r of ms) byStatus[r.status] = r.n;
      const recent = await db.select({ type: emailEvents.type, createdAt: emailEvents.createdAt }).from(emailEvents)
        .where(eq(emailEvents.workspaceId, wsId)).orderBy(desc(emailEvents.createdAt)).limit(2000);
      const days = new Map<string, { sent: number; opened: number; replied: number }>();
      for (let i = 13; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000);
        days.set(d.toISOString().slice(0, 10), { sent: 0, opened: 0, replied: 0 });
      }
      for (const e of recent) {
        const key = new Date(e.createdAt).toISOString().slice(0, 10);
        const row = days.get(key);
        if (!row) continue;
        if (e.type === "sent" || e.type === "delivered") row.sent += 1;
        if (e.type === "opened") row.opened += 1;
        if (e.type === "replied") row.replied += 1;
      }
      daily = [...days.entries()].map(([date, v]) => ({ date, ...v }));
      dbReady = true;
    } catch { /* db not initialised — empty state below */ }
  }

  const totalEvents = Object.values(byType).reduce((a, b) => a + b, 0);
  const sent = (byType.sent ?? 0) + (byType.delivered ?? 0);
  const openRate = (byType.delivered ?? 0) > 0 ? (((byType.opened ?? 0) / (byType.delivered ?? 1)) * 100).toFixed(1) : null;
  const replyRate = sent > 0 ? (((byType.replied ?? 0) / sent) * 100).toFixed(1) : null;

  return (
    <AppShell current="/analytics" title="Analytics" subtitle={sess.workspace?.name ?? ""}>
      {!dbReady && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>Analytics data is not available yet.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>The database has no tables yet — run migrations, then send a campaign to see real numbers here. Nothing is estimated.</p>
        </div>
      )}
      {dbReady && totalEvents === 0 && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <strong>No data yet — import leads and launch a campaign.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>Analytics fill in from real email events as campaigns send.</p>
        </div>
      )}
      <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
        <div className="card"><div className="stat-num">{sent.toLocaleString()}</div><div className="stat-label">Sent + delivered</div></div>
        <div className="card"><div className="stat-num">{(byType.opened ?? 0).toLocaleString()}</div><div className="stat-label">Opened</div></div>
        <div className="card"><div className="stat-num">{(byType.replied ?? 0).toLocaleString()}</div><div className="stat-label">Replied</div></div>
        <div className="card"><div className="stat-num">{(byType.bounced ?? 0).toLocaleString()}</div><div className="stat-label">Bounced</div></div>
        <div className="card"><div className="stat-num">{openRate === null ? "—" : `${openRate}%`}</div><div className="stat-label">Open rate (of delivered)</div></div>
        <div className="card"><div className="stat-num">{replyRate === null ? "—" : `${replyRate}%`}</div><div className="stat-label">Reply rate (of sent)</div></div>
        <div className="card"><div className="stat-num">{(byType.unsubscribed ?? 0).toLocaleString()}</div><div className="stat-label">Unsubscribed</div></div>
        <div className="card"><div className="stat-num">{(byType.complained ?? 0).toLocaleString()}</div><div className="stat-label">Complaints</div></div>
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3>Events by type</h3>
          {totalEvents === 0 ? <p className="muted">No events recorded yet.</p> : (
            <table>
              <thead><tr><th>Event</th><th>Count</th></tr></thead>
              <tbody>
                {EVENT_TYPES.map((t) => (
                  <tr key={t}><td>{t}</td><td>{(byType[t] ?? 0).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card">
          <h3>Messages by status</h3>
          {Object.keys(byStatus).length === 0 ? <p className="muted">No messages yet.</p> : (
            <table>
              <thead><tr><th>Status</th><th>Count</th></tr></thead>
              <tbody>
                {Object.entries(byStatus).sort((a, b) => b[1] - a[1]).map(([s, n]) => (
                  <tr key={s}><td>{s}</td><td>{n.toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Last 14 days</h3>
        {totalEvents === 0 ? <p className="muted">No activity in the last 14 days.</p> : (
          <table>
            <thead><tr><th>Date</th><th>Sent</th><th>Opened</th><th>Replied</th></tr></thead>
            <tbody>
              {daily.map((d) => (
                <tr key={d.date}><td>{d.date}</td><td>{d.sent}</td><td>{d.opened}</td><td>{d.replied}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
