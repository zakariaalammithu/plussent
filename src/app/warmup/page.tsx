import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { emailAccounts, warmupSessions } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

export default async function WarmupPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;
  let accounts: { id: string; email: string; provider: string; healthScore: number; status: string }[] = [];
  let sessionsList: { id: string; emailAccountId: string; status: string; dailyVolume: number }[] = [];
  let dbReady = false;
  if (wsId) {
    try {
      accounts = await db.select({ id: emailAccounts.id, email: emailAccounts.email, provider: emailAccounts.provider, healthScore: emailAccounts.healthScore, status: emailAccounts.status })
        .from(emailAccounts).where(eq(emailAccounts.workspaceId, wsId));
      sessionsList = await db.select({ id: warmupSessions.id, emailAccountId: warmupSessions.emailAccountId, status: warmupSessions.status, dailyVolume: warmupSessions.dailyVolume })
        .from(warmupSessions).where(eq(warmupSessions.workspaceId, wsId));
      dbReady = true;
    } catch { /* db not initialised */ }
  }
  const byAccount = new Map(sessionsList.map((s) => [s.emailAccountId, s]));
  return (
    <AppShell current="/warmup" title="Email Warmup" subtitle={sess.workspace?.name ?? ""}>
      {!dbReady && (
        <div className="card"><strong>Warmup data is not available yet.</strong><p className="muted" style={{ margin: "0.5rem 0 0" }}>The database has no tables yet — run migrations first.</p></div>
      )}
      {dbReady && accounts.length === 0 && (
        <div className="card">
          <strong>No email accounts connected.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>Warmup runs per connected email account. Connect Gmail, Outlook or SMTP from Email Accounts first — warmup sessions are created there, and their status appears here.</p>
        </div>
      )}
      {accounts.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Account</th><th>Provider</th><th>Status</th><th>Health</th><th>Warmup</th><th>Daily volume</th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const w = byAccount.get(a.id);
                return (
                  <tr key={a.id}>
                    <td>{a.email}</td>
                    <td>{a.provider}</td>
                    <td><span className="badge">{a.status}</span></td>
                    <td>{a.healthScore}/100</td>
                    <td>{w ? <span className="badge">{w.status}</span> : <span className="muted">no warmup session</span>}</td>
                    <td>{w ? w.dailyVolume : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="small muted">Warmup start/pause controls live on the Email Accounts page, which owns account management. This page reports status only — it never invents a warmup run.</p>
        </div>
      )}
    </AppShell>
  );
}
