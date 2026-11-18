"use client";
import { useState } from "react";

function apiError(status: number, fallback: string): string {
  if (status === 404) return "Auth API not available yet — this endpoint is still being built (auth API pending).";
  return fallback;
}

export function ProfileForm({ initialName, initialEmail }: { initialName: string; initialEmail: string }) {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: name, email }) });
      const j = await r.json().catch(() => ({})) as { error?: string; message?: string };
      setMsg(r.ok ? "Profile updated." : (j.message ?? j.error ?? apiError(r.status, "Could not update profile.")));
    } catch { setMsg("Could not reach the server."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit}>
      <div className="form-row"><label htmlFor="pf-name">Full name</label><input id="pf-name" value={name} onChange={(e) => setName(e.target.value)} /></div>
      <div className="form-row"><label htmlFor="pf-email">Email</label><input id="pf-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      {msg && <p className="small" style={{ marginTop: "0.5rem" }}>{msg}</p>}
    </form>
  );
}

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next.length < 8) { setMsg("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setMsg("New passwords do not match."); return; }
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (r.ok) { setMsg("Password changed."); setCurrent(""); setNext(""); setConfirm(""); }
      else setMsg(j.error ?? apiError(r.status, "Could not change password."));
    } catch { setMsg("Could not reach the server."); }
    setBusy(false);
  }
  return (
    <form onSubmit={submit}>
      <div className="form-row"><label htmlFor="cp-current">Current password</label><input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" /></div>
      <div className="form-row"><label htmlFor="cp-new">New password</label><input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" /></div>
      <div className="form-row"><label htmlFor="cp-confirm">Confirm new password</label><input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" /></div>
      <button className="btn" type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
      {msg && <p className="small" style={{ marginTop: "0.5rem" }}>{msg}</p>}
    </form>
  );
}

export function TotpSetup({ enabled }: { enabled: boolean }) {
  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function setup() {
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/totp/setup", { method: "POST" });
      const j = await r.json().catch(() => ({})) as { secret?: string; otpauthUrl?: string; error?: string };
      if (r.ok && j.secret) { setSecret(j.secret); setOtpauth(j.otpauthUrl ?? ""); setMsg("Scan the secret below with your authenticator app, then enter a code to confirm."); }
      else setMsg(j.error ?? apiError(r.status, "Could not start 2FA setup."));
    } catch { setMsg("Could not reach the server."); }
    setBusy(false);
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/auth/totp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      setMsg(r.ok ? "Two-factor authentication enabled." : (j.error ?? apiError(r.status, "Verification failed.")));
      if (r.ok) { setSecret(""); setCode(""); }
    } catch { setMsg("Could not reach the server."); }
    setBusy(false);
  }
  // Note: there is no /api/auth/totp/disable endpoint yet — disabling 2FA is
  // not offered as a button rather than one that can never work. When the auth
  // builder adds it, wire it here.
  return (
    <div>
      <p className="muted">Status: <strong>{enabled ? "Enabled" : "Not enabled"}</strong></p>
      {enabled ? (
        <p className="small muted">2FA is on for your account. Disabling it is not available yet — no disable endpoint exists in the auth API.</p>
      ) : (
        <button className="btn" type="button" onClick={setup} disabled={busy}>{busy ? "Starting…" : "Set up 2FA"}</button>
      )}
      {secret && (
        <form onSubmit={verify} style={{ marginTop: "1rem" }}>
          <p className="small">Secret (enter it manually in your authenticator app):</p>
          <p><code>{secret}</code></p>
          {otpauth && <p className="small muted" style={{ wordBreak: "break-all" }}>{otpauth}</p>}
          <div className="form-row"><label htmlFor="totp-code">6-digit code</label><input id="totp-code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} required /></div>
          <button className="btn" type="submit" disabled={busy}>Verify &amp; enable</button>
        </form>
      )}
      {msg && <p className="small" style={{ marginTop: "0.5rem" }}>{msg}</p>}
    </div>
  );
}

export interface SessionRow {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: number;
  expiresAt: number;
  current: boolean;
}

/** Session list with real revoke via DELETE /api/auth/sessions. */
export function SessionList({ initial, currentId }: { initial: SessionRow[]; currentId: string }) {
  const [rows, setRows] = useState(initial);
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusyId(id); setMsg("");
    try {
      const r = await fetch("/api/auth/sessions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const j = await r.json().catch(() => ({})) as { error?: string };
      if (r.ok) setRows((prev) => prev.filter((s) => s.id !== id));
      else setMsg(j.error ?? `Could not revoke session (${r.status}).`);
    } catch { setMsg("Could not reach the server."); }
    setBusyId(null);
  }

  if (rows.length === 0) return <p className="muted">No sessions found.</p>;
  return (
    <div>
      <table>
        <thead><tr><th>Device / browser</th><th>IP</th><th>Created</th><th>Expires</th><th /></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.userAgent ?? "—"}</td>
              <td>{s.ip ?? "—"}</td>
              <td>{new Date(s.createdAt).toLocaleString()}</td>
              <td>{new Date(s.expiresAt).toLocaleString()}</td>
              <td>
                {s.id === currentId || s.current ? <span className="badge badge-brand">this session</span> : (
                  <button className="btn btn-secondary btn-sm" type="button" onClick={() => revoke(s.id)} disabled={busyId === s.id}>
                    {busyId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="error small" style={{ marginTop: "0.5rem" }}>{msg}</p>}
    </div>
  );
}
