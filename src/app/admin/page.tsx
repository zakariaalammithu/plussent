import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionUser, isSuperAdmin } from "@/lib/session";
import AppShell from "../_components/AppShell";

interface AdminStats {
  users: number; workspaces: number; leads: number; campaigns: number;
  emailMessages: number; activeSubscriptions: number; aiCallsLast24h: number;
  workspacesByPlan: Record<string, number>;
}
interface AdminUser {
  id: string; email: string; fullName: string | null; status: string;
  isSuperAdmin: boolean; emailVerified: boolean; totpEnabled: boolean; createdAt: number;
  workspaces: { workspaceId: string; workspaceName: string; plan: string; role: string }[];
}

async function adminFetch<T>(path: string): Promise<{ ok: boolean; data: T | null; status: number }> {
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") ?? h.get("host");
    if (!host) return { ok: false, data: null, status: 0 };
    const proto = h.get("x-forwarded-proto") ?? "http";
    const res = await fetch(`${proto}://${host}${path}`, {
      headers: { cookie: h.get("cookie") ?? "" },
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, data: null, status: res.status };
    return { ok: true, data: (await res.json()) as T, status: res.status };
  } catch {
    return { ok: false, data: null, status: 0 };
  }
}

export default async function AdminPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  if (!isSuperAdmin(sess)) {
    return (
      <AppShell current="/admin" title="Admin">
        <div className="card">
          <strong>Super-admin only.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>This area is restricted to super-admin accounts. Your account ({sess.user.email}) does not have that flag.</p>
        </div>
      </AppShell>
    );
  }

  const stats = await adminFetch<AdminStats>("/api/admin/stats");
  const usersRes = await adminFetch<{ users: AdminUser[] }>("/api/admin/users");

  return (
    <AppShell current="/admin" title="Admin" subtitle="Super-admin">
      {!stats.ok || !usersRes.ok ? (
        <div className="card">
          <strong>Admin API pending.</strong>
          <p className="muted" style={{ margin: "0.5rem 0 0" }}>
            The admin API did not return data (stats: {stats.status || "unreachable"}, users: {usersRes.status || "unreachable"}).
            Check that the database is migrated and the server is running. No numbers are shown rather than showing invented ones.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-4" style={{ marginBottom: "1rem" }}>
            <div className="card"><div className="stat-num">{stats.data!.users}</div><div className="stat-label">Users</div></div>
            <div className="card"><div className="stat-num">{stats.data!.workspaces}</div><div className="stat-label">Workspaces</div></div>
            <div className="card"><div className="stat-num">{stats.data!.leads}</div><div className="stat-label">Leads</div></div>
            <div className="card"><div className="stat-num">{stats.data!.campaigns}</div><div className="stat-label">Campaigns</div></div>
            <div className="card"><div className="stat-num">{stats.data!.emailMessages}</div><div className="stat-label">Email messages</div></div>
            <div className="card"><div className="stat-num">{stats.data!.activeSubscriptions}</div><div className="stat-label">Active subscriptions</div></div>
            <div className="card"><div className="stat-num">{stats.data!.aiCallsLast24h}</div><div className="stat-label">AI calls (last 24h)</div></div>
            <div className="card">
              <div className="stat-label">Workspaces by plan</div>
              {Object.entries(stats.data!.workspacesByPlan).length === 0 ? <p className="muted">None yet.</p> : (
                <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem" }}>
                  {Object.entries(stats.data!.workspacesByPlan).map(([p, n]) => <li key={p}>{p}: {n}</li>)}
                </ul>
              )}
            </div>
          </div>

          <div className="card">
            <h3>Users</h3>
            {usersRes.data!.users.length === 0 ? <p className="muted">No users yet.</p> : (
              <table>
                <thead><tr><th>Email</th><th>Name</th><th>Status</th><th>2FA</th><th>Workspaces</th><th>Joined</th></tr></thead>
                <tbody>
                  {usersRes.data!.users.map((u) => (
                    <tr key={u.id}>
                      <td>{u.email}{u.isSuperAdmin ? " " : ""}{u.isSuperAdmin && <span className="badge badge-brand">super-admin</span>}</td>
                      <td>{u.fullName ?? "—"}</td>
                      <td><span className="badge">{u.status}{u.emailVerified ? " · verified" : " · unverified"}</span></td>
                      <td>{u.totpEnabled ? "on" : "off"}</td>
                      <td>{u.workspaces.length === 0 ? "—" : u.workspaces.map((w) => `${w.workspaceName} (${w.role}, ${w.plan})`).join(", ")}</td>
                      <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="small muted">User suspension, deletion and plan changes are not wired to buttons here — those actions need the admin management API, which does not exist yet. Nothing here performs an irreversible action.</p>
          </div>
        </>
      )}
    </AppShell>
  );
}
