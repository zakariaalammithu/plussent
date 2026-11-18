import Link from "next/link";
import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { campaigns, sequences } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

export default async function SequencesPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;
  let rows: { campaignName: string; campaignStatus: string; step: number; subject: string; delayDays: number; delayMinutes: number; variant: string }[] = [];
  let dbReady = false;
  if (wsId) {
    try {
      const camps = await db.select().from(campaigns).where(eq(campaigns.workspaceId, wsId));
      const campById = new Map(camps.map((c) => [c.id, c]));
      const ids = camps.map((c) => c.id);
      const seqs = ids.length > 0
        ? await db.select().from(sequences).where(inArray(sequences.campaignId, ids)).orderBy(asc(sequences.campaignId), asc(sequences.step))
        : [];
      rows = seqs.map((s) => ({
        campaignName: campById.get(s.campaignId)?.name ?? s.campaignId,
        campaignStatus: campById.get(s.campaignId)?.status ?? "—",
        step: s.step, subject: s.subject, delayDays: s.delayDays, delayMinutes: s.delayMinutes, variant: s.variant,
      }));
      dbReady = true;
    } catch { /* db not initialised */ }
  }
  return (
    <AppShell current="/sequences" title="Sequences" subtitle={sess.workspace?.name ?? ""}>
      {!dbReady && (
        <div className="card"><strong>Sequences are not available yet.</strong><p className="muted" style={{ margin: "0.5rem 0 0" }}>The database has no tables yet — run migrations first.</p></div>
      )}
      {dbReady && rows.length === 0 && (
        <div className="card">
          <strong>No sequences yet.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>Sequences belong to campaigns. Create a campaign and add its email steps there — they will appear here.</p>
          <p style={{ marginTop: "1rem" }}><Link href="/campaigns" className="btn">Go to Campaigns</Link></p>
        </div>
      )}
      {rows.length > 0 && (
        <div className="card">
          <table>
            <thead><tr><th>Campaign</th><th>Status</th><th>Step</th><th>Variant</th><th>Subject</th><th>Delay</th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td>{r.campaignName}</td>
                  <td><span className="badge">{r.campaignStatus}</span></td>
                  <td>{r.step}</td>
                  <td>{r.variant}</td>
                  <td>{r.subject}</td>
                  <td>{r.delayDays}d {r.delayMinutes}m</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
