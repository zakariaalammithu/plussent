import { redirect } from "next/navigation";
import { count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { domains, emailEvents } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

export default async function DeliverabilityPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;
  let doms: { domain: string; spfOk: number; dkimOk: number; dmarcOk: number; mxOk: number; lastCheckedAt: number | null }[] = [];
  let bounced = 0;
  let complained = 0;
  let delivered = 0;
  let dbReady = false;
  if (wsId) {
    try {
      doms = await db.select().from(domains).where(eq(domains.workspaceId, wsId));
      const ev = await db.select({ type: emailEvents.type, n: count() }).from(emailEvents)
        .where(eq(emailEvents.workspaceId, wsId)).groupBy(emailEvents.type);
      for (const r of ev) {
        if (r.type === "bounced") bounced = r.n;
        if (r.type === "complained") complained = r.n;
        if (r.type === "delivered") delivered = r.n;
      }
      dbReady = true;
    } catch { /* db not initialised */ }
  }
  const bounceRate = delivered + bounced > 0 ? (((bounced / (delivered + bounced)) * 100).toFixed(1)) : null;
  return (
    <AppShell current="/deliverability" title="Deliverability" subtitle={sess.workspace?.name ?? ""}>
      {!dbReady && (
        <div className="card"><strong>Deliverability data is not available yet.</strong><p className="muted" style={{ margin: "0.5rem 0 0" }}>The database has no tables yet — run migrations first.</p></div>
      )}
      <div className="grid grid-3" style={{ marginBottom: "1rem" }}>
        <div className="card"><div className="stat-num">{delivered.toLocaleString()}</div><div className="stat-label">Delivered</div></div>
        <div className="card"><div className="stat-num">{bounced.toLocaleString()}</div><div className="stat-label">Bounced</div></div>
        <div className="card"><div className="stat-num">{bounceRate === null ? "—" : `${bounceRate}%`}</div><div className="stat-label">Bounce rate</div></div>
        <div className="card"><div className="stat-num">{complained.toLocaleString()}</div><div className="stat-label">Complaints</div></div>
        <div className="card"><div className="stat-num">{doms.length}</div><div className="stat-label">Domains checked</div></div>
      </div>
      <div className="card">
        <h3>Domain authentication</h3>
        {doms.length === 0 ? (
          <p className="muted">No domains registered yet. Domains are added from Email Accounts / Deliverability settings — SPF, DKIM, DMARC and MX results appear here once a real DNS check has run. No check is faked.</p>
        ) : (
          <table>
            <thead><tr><th>Domain</th><th>SPF</th><th>DKIM</th><th>DMARC</th><th>MX</th><th>Last checked</th></tr></thead>
            <tbody>
              {doms.map((d) => (
                <tr key={d.domain}>
                  <td>{d.domain}</td>
                  <td>{d.spfOk ? <span className="badge badge-ok">pass</span> : <span className="badge badge-bad">fail / unchecked</span>}</td>
                  <td>{d.dkimOk ? <span className="badge badge-ok">pass</span> : <span className="badge badge-bad">fail / unchecked</span>}</td>
                  <td>{d.dmarcOk ? <span className="badge badge-ok">pass</span> : <span className="badge badge-bad">fail / unchecked</span>}</td>
                  <td>{d.mxOk ? <span className="badge badge-ok">pass</span> : <span className="badge badge-bad">fail / unchecked</span>}</td>
                  <td>{d.lastCheckedAt ? new Date(d.lastCheckedAt).toLocaleString() : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
