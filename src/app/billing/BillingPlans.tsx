"use client";
import { useState } from "react";

const PLANS = [
  { id: "free", name: "Free", price: "$0", features: ["100 leads", "1 email account", "1 active campaign"] },
  { id: "starter", name: "Starter", price: "$29/mo", features: ["2,500 leads", "3 email accounts", "Warmup included"] },
  { id: "growth", name: "Growth", price: "$79/mo", features: ["25,000 leads", "10 email accounts", "Unified inbox + AI classification"] },
  { id: "agency", name: "Agency", price: "$199/mo", features: ["100,000 leads", "50 email accounts", "Unlimited workspaces"] },
  { id: "enterprise", name: "Enterprise", price: "Custom", features: ["Unlimited everything", "Dedicated IPs", "SSO & audit logs"] },
];

export default function BillingPlans({ currentPlan }: { currentPlan: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  async function checkout(plan: string) {
    setBusy(plan); setMsg("");
    try {
      const r = await fetch("/api/billing/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plan }) });
      const j = await r.json().catch(() => ({})) as { url?: string; error?: string; detail?: string; status?: string };
      if (r.ok && j.url) { window.location.href = j.url; return; }
      setMsg(j.status === "awaiting_credentials"
        ? `Checkout is not available yet — billing is awaiting credentials. ${j.detail ?? ""}`
        : (j.error ?? `Checkout failed (${r.status}). ${j.detail ?? ""}`));
    } catch { setMsg("Could not reach the server."); }
    setBusy(null);
  }

  return (
    <div>
      {msg && <p className="error small" style={{ marginBottom: "1rem" }}>{msg}</p>}
      <div className="pricing-grid">
        {PLANS.map((p) => {
          const isCurrent = p.id === currentPlan;
          return (
            <article key={p.id} className="card" style={{ display: "flex", flexDirection: "column", borderColor: isCurrent ? "var(--accent)" : undefined }}>
              <h3>{p.name} {isCurrent && <span className="badge badge-brand">current plan</span>}</h3>
              <p className="price">{p.price}</p>
              <ul style={{ margin: "0 0 1rem", paddingLeft: "1.1rem", flex: 1 }}>
                {p.features.map((f) => <li key={f} className="small">{f}</li>)}
              </ul>
              {isCurrent ? (
                <button className="btn btn-secondary" type="button" disabled>Current plan</button>
              ) : p.id === "free" ? (
                <span className="small muted">Downgrade to Free is handled by cancelling your paid plan — contact support or cancel from your Stripe customer portal once billing is connected.</span>
              ) : p.id === "enterprise" ? (
                <button className="btn btn-secondary" type="button" onClick={() => checkout("enterprise")} disabled={busy !== null}>
                  {busy === "enterprise" ? "…" : "Talk to us"}
                </button>
              ) : (
                <button className="btn" type="button" onClick={() => checkout(p.id)} disabled={busy !== null}>
                  {busy === p.id ? "Redirecting…" : `Upgrade to ${p.name}`}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
