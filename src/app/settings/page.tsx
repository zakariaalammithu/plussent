import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";
import { providerStatus } from "@/lib/ai/providers";
import { getSessionUser } from "@/lib/session";
import AppShell from "../_components/AppShell";
import { ChangePasswordForm, ProfileForm, SessionList, TotpSetup } from "./SettingsForms";

function envStatus(names: string[]): "configured" | "awaiting_credentials" {
  return names.every((n) => !!process.env[n]) ? "configured" : "awaiting_credentials";
}

function StatusBadge({ status }: { status: string }) {
  return status === "configured"
    ? <span className="badge badge-ok">configured</span>
    : <span className="badge badge-warn">awaiting_credentials</span>;
}

export default async function SettingsPage() {
  const sess = await getSessionUser();
  if (!sess) redirect("/login");
  const ai = providerStatus();
  let mySessions: { id: string; userAgent: string | null; ip: string | null; createdAt: number; expiresAt: number }[] = [];
  let dbReady = false;
  try {
    mySessions = await db.select({ id: sessions.id, userAgent: sessions.userAgent, ip: sessions.ip, createdAt: sessions.createdAt, expiresAt: sessions.expiresAt })
      .from(sessions).where(eq(sessions.userId, sess.user.id)).orderBy(desc(sessions.createdAt)).limit(20);
    dbReady = true;
  } catch { /* db not initialised */ }

  const integrations: { name: string; status: string; hint: string }[] = [
    { name: "Gmail OAuth", status: envStatus(["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]), hint: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET, then connect from Email Accounts." },
    { name: "Outlook OAuth", status: envStatus(["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET"]), hint: "Set MICROSOFT_CLIENT_ID + MICROSOFT_CLIENT_SECRET, then connect from Email Accounts." },
    { name: "SMTP sending", status: envStatus(["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]), hint: "Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS." },
    { name: "Stripe billing", status: envStatus(["STRIPE_SECRET_KEY"]), hint: "Set STRIPE_SECRET_KEY (+ STRIPE_WEBHOOK_SECRET for webhooks) to enable checkout." },
    { name: "Muse AI", status: ai.muse, hint: "Needs MUSE_API_URL + MUSE_API_KEY — and a documented Muse endpoint. No endpoint is assumed." },
    { name: "OpenAI", status: ai.openai, hint: "Set OPENAI_API_KEY." },
    { name: "Anthropic", status: ai.anthropic, hint: "Set ANTHROPIC_API_KEY." },
    { name: "Heuristic AI (built-in)", status: ai.heuristic, hint: "Always available. Rule-based drafts and classification, labelled heuristic." },
  ];

  return (
    <AppShell current="/settings" title="Settings" subtitle={sess.workspace?.name ?? ""}>
      <div className="grid grid-2">
        <div className="card">
          <h3>Profile</h3>
          <ProfileForm initialName={sess.user.fullName ?? ""} initialEmail={sess.user.email} />
          <p className="small muted" style={{ marginTop: "0.75rem" }}>
            Email verified: {sess.user.emailVerifiedAt ? "yes" : "no"} · Role: {sess.user.isSuperAdmin === 1 ? "super-admin" : "user"}
          </p>
        </div>
        <div className="card">
          <h3>Change password</h3>
          <ChangePasswordForm />
        </div>
        <div className="card">
          <h3>Two-factor authentication</h3>
          <TotpSetup enabled={sess.user.totpEnabled === 1} />
        </div>
        <div className="card">
          <h3>Workspace</h3>
          <p><strong>{sess.workspace?.name ?? "No workspace"}</strong></p>
          <p className="muted">Plan: {sess.workspace?.plan ?? "—"}</p>
          <p className="muted small">Workspace changes (name, members) are managed from Team. Plan changes live on the Billing page.</p>
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Sessions</h3>
        {!dbReady ? <p className="muted">Session list unavailable — database not initialised yet.</p> : (
          <SessionList
            currentId={sess.sessionId}
            initial={mySessions.map((s) => ({ ...s, current: s.id === sess.sessionId }))}
          />
        )}
        <p className="small muted">Revoking a session signs that device out immediately. If a session here looks wrong, revoke it and change your password.</p>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Integrations &amp; AI providers</h3>
        <p className="muted small">Statuses are derived from server configuration only. No secret values are shown here — ever.</p>
        <table>
          <thead><tr><th>Integration</th><th>Status</th><th>How to configure</th></tr></thead>
          <tbody>
            {integrations.map((i) => (
              <tr key={i.name}><td>{i.name}</td><td><StatusBadge status={i.status} /></td><td className="small muted">{i.hint}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
