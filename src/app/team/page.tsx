import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, workspaceMembers } from "@/lib/db/schema";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";

export default async function TeamPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const wsId = sess.workspace?.id;
  let members: { email: string; fullName: string | null; role: string; joined: number }[] = [];
  let dbReady = false;
  if (wsId) {
    try {
      const ms = await db.select().from(workspaceMembers).where(eq(workspaceMembers.workspaceId, wsId));
      const us = await db.select().from(users);
      const byId = new Map(us.map((u) => [u.id, u]));
      members = ms.map((m) => {
        const u = byId.get(m.userId);
        return { email: u?.email ?? m.userId, fullName: u?.fullName ?? null, role: m.role, joined: m.createdAt };
      });
      dbReady = true;
    } catch { /* db not initialised */ }
  }
  return (
    <AppShell current="/team" title="Team" subtitle={sess.workspace?.name ?? ""}>
      {!dbReady && (
        <div className="card"><strong>Team data is not available yet.</strong><p className="muted" style={{ margin: "0.5rem 0 0" }}>The database has no tables yet — run migrations first.</p></div>
      )}
      <div className="card">
        <h3>Members</h3>
        {members.length === 0 ? (
          <p className="muted">No members found for this workspace.</p>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.email}>
                  <td>{m.fullName ?? "—"}</td>
                  <td>{m.email}</td>
                  <td><span className="badge">{m.role}</span></td>
                  <td>{new Date(m.joined).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="small muted">
          Roles: owner, admin, member, viewer. Inviting a new member sends an email, so invites are disabled until
          the auth/mailer API exists — no invite button is shown rather than one that silently does nothing.
        </p>
      </div>
    </AppShell>
  );
}
