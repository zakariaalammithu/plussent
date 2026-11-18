"use client";
import { useEffect, useState } from "react";
type Acct = { id: string; provider: string; email: string; status: string; dailyLimit: number; healthScore: number };
export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Acct[]>([]);
  const [msg, setMsg] = useState("Loading…");
  const [form, setForm] = useState({ provider: "smtp", email: "", host: "", port: "587", user: "", pass: "" });
  async function load() {
    const r = await fetch("/api/email-accounts");
    if (!r.ok) { setMsg("Could not load email accounts."); return; }
    const j = await r.json(); setAccounts(j.accounts || []); setMsg(j.accounts?.length ? "" : "No email accounts connected yet.");
  }
  useEffect(() => { load(); }, []);
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setMsg("Testing connection…");
    const r = await fetch("/api/email-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json();
    setMsg(r.ok ? `Connected: ${j.account?.email ?? form.email}` : (j.error || "Connection failed."));
    if (r.ok) load();
  }
  async function test(id: string) {
    const r = await fetch(`/api/email-accounts/${id}/test`, { method: "POST" });
    const j = await r.json(); setMsg(r.ok ? `Test: ${j.status ?? "ok"}` : (j.error || "Test failed.")); load();
  }
  async function disconnect(id: string) {
    const r = await fetch(`/api/email-accounts/${id}`, { method: "DELETE" });
    setMsg(r.ok ? "Disconnected." : "Could not disconnect."); load();
  }
  return (<main style={{ padding: 24 }}>
    <h1>Email Accounts</h1>
    <p>Connect Gmail, Outlook or SMTP accounts. Credentials are encrypted (AES-256-GCM) and never shown back.</p>
    {msg && <p>{msg}</p>}
    <ul>{accounts.map((a) => (<li key={a.id}>{a.email} — {a.provider} — {a.status} — health {a.healthScore} — limit {a.dailyLimit}/day <button onClick={() => test(a.id)}>Test</button> <button onClick={() => disconnect(a.id)}>Disconnect</button></li>))}</ul>
    <h2>Connect an SMTP account</h2>
    <form onSubmit={connect}>
      <input required placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input required placeholder="SMTP host" value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} />
      <input placeholder="Port" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
      <input placeholder="SMTP user" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} />
      <input type="password" placeholder="SMTP password / app password" value={form.pass} onChange={(e) => setForm({ ...form, pass: e.target.value })} />
      <button type="submit">Test &amp; connect</button>
    </form>
    <p>Gmail / Outlook OAuth: connect from Settings → Integrations once the OAuth clients are configured (currently awaiting credentials).</p>
  </main>);
}
