"use client";
import { useState } from "react";

interface Msg { role: "user" | "ai"; text: string; provider?: string; status?: string; detail?: string }

const PROMPTS = [
  { label: "Write a sequence", kind: "email_write", prompt: "Write a 3-step cold email sequence for a SaaS that helps sales teams book more meetings. Keep each email under 120 words, friendly and specific, with a clear call to action." },
  { label: "Personalize an opener", kind: "personalization", prompt: "Write 3 personalized first lines for a cold email to the VP of Sales at a mid-size logistics company, referencing that they recently expanded into a new region." },
  { label: "Analyze a reply", kind: "reply_classify", prompt: "Analyze this reply and tell me what it means and how to respond: 'Thanks for reaching out — this looks interesting. Can you send pricing and a time to talk next week?'" },
];

export default function AiPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [kind, setKind] = useState("assistant");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [usage, setUsage] = useState<{ today: number; cap: number } | null>(null);
  const [error, setError] = useState("");

  async function send(prompt: string, k: string) {
    if (!prompt.trim() || busy) return;
    setBusy(true); setError("");
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    setInput("");
    try {
      const r = await fetch("/api/ai/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: k, prompt }) });
      const j = await r.json().catch(() => ({})) as { provider?: string; status?: string; text?: string | null; detail?: string | null; error?: string; usageToday?: number; cap?: number };
      if (!r.ok) {
        setError(j.error ?? `AI request failed (${r.status}).`);
        setMessages((m) => [...m, { role: "ai", text: j.error ?? "Request failed.", status: "error" }]);
      } else {
        setUsage({ today: j.usageToday ?? 0, cap: j.cap ?? 100 });
        setMessages((m) => [...m, {
          role: "ai",
          text: j.text ?? "(no text returned)",
          provider: j.provider, status: j.status, detail: j.detail ?? undefined,
        }]);
      }
    } catch {
      setError("Could not reach the server.");
      setMessages((m) => [...m, { role: "ai", text: "Could not reach the server.", status: "error" }]);
    }
    setBusy(false);
  }

  return (
    <div>
      <p className="muted">
        Ask PlusSent AI to draft a sequence, personalize an opener, or analyze a reply. Every answer shows the
        provider that produced it — a real provider when configured, otherwise the built-in heuristic, clearly labelled.
        {usage && <> Usage today: <strong>{usage.today} / {usage.cap}</strong> (per-workspace daily cap).</>}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {PROMPTS.map((p) => (
          <button key={p.label} type="button" className="btn btn-secondary btn-sm" onClick={() => send(p.prompt, p.kind)} disabled={busy}>
            {p.label}
          </button>
        ))}
      </div>
      <div className="chat-log">
        {messages.length === 0 && <p className="muted">No conversation yet — pick a suggestion above or write your own prompt.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role === "user" ? "user" : ""}`}>
            {m.role === "ai" && m.provider && (
              <p className="small" style={{ margin: "0 0 0.4rem" }}>
                <span className="badge badge-brand">{m.provider}</span>{" "}
                <span className="badge">{m.status}</span>
              </p>
            )}
            {m.text}
            {m.detail && <p className="small muted" style={{ margin: "0.5rem 0 0" }}>{m.detail}</p>}
          </div>
        ))}
      </div>
      {error && <p className="error small">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); send(input, kind); }}>
        <div className="form-row">
          <label htmlFor="ai-kind">Kind</label>
          <select id="ai-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="assistant">General assistant</option>
            <option value="email_write">Write email / sequence</option>
            <option value="personalization">Personalization</option>
            <option value="reply_classify">Analyze a reply</option>
          </select>
        </div>
        <div className="form-row">
          <label htmlFor="ai-input">Your prompt</label>
          <textarea id="ai-input" rows={4} value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. Draft a follow-up email for a prospect who opened but did not reply…" />
        </div>
        <button className="btn" type="submit" disabled={busy || !input.trim()}>{busy ? "Thinking…" : "Send"}</button>
      </form>
      <p className="small muted" style={{ marginTop: "1rem" }}>
        Tip: configure a real provider in Settings → Integrations (OpenAI, Anthropic or Muse). Until then the
        assistant answers with the built-in heuristic and says so.
      </p>
    </div>
  );
}
