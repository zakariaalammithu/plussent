// Unified Inbox — conversations, status/assign, manual reply, heuristic classify.
"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../_components/AppShell";

interface Conversation {
  id: string;
  subject: string | null;
  classification: string | null;
  classificationSource: string | null;
  status: string;
  assignedTo: string | null;
  updatedAt: number;
  lead: { id: string; email: string; name: string | null; company: string | null } | null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok) throw new Error(j.message || j.error || `Request failed (${r.status})`);
  return j;
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [sending, setSending] = useState(false);
  const [classifyText, setClassifyText] = useState("");
  const [classifyResult, setClassifyResult] = useState<{ classification: string; source: string } | null>(null);

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (status) params.set("status", status);
      const j = await api<{ conversations: Conversation[]; total: number }>(`/api/inbox?${params}`);
      setConversations(j.conversations);
      setTotal(j.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load inbox.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(statusFilter);
  }, [load, statusFilter]);

  async function setStatus(c: Conversation, status: string) {
    setError(null);
    try {
      const j = await api<{ conversation: Conversation }>(`/api/inbox/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setSelected(j.conversation);
      setNotice(`Conversation ${status}.`);
      void load(statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update conversation.");
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !replyBody.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/inbox/${selected.id}/reply`, {
        method: "POST",
        body: JSON.stringify({ body: replyBody }),
      });
      setReplyBody("");
      setNotice("Reply sent and recorded.");
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not send reply.");
    } finally {
      setSending(false);
    }
  }

  async function classifySelected() {
    if (!selected) return;
    const text = classifyText.trim() || selected.subject || "";
    if (!text) {
      setError("Paste the reply text to classify, or pick a conversation with a subject.");
      return;
    }
    setError(null);
    try {
      const j = await api<{ classification: string; source: string }>(`/api/inbox/classify`, {
        method: "POST",
        body: JSON.stringify({ text, conversationId: selected.id }),
      });
      setClassifyResult(j);
      setNotice(`Classified as "${j.classification}" (heuristic — keyword-based, not an AI judgement).`);
      void load(statusFilter);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Classification failed.");
    }
  }

  return (
    <AppShell current="/inbox" title="Unified Inbox" subtitle="Replies across campaigns and accounts, in one place.">
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok-text">{notice}</p>}

      <div className="grid grid-2">
        <div className="card">
          <h2>Conversations ({total})</h2>
          <div className="form-row">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open</option>
              <option value="starred">Starred</option>
              <option value="assigned">Assigned</option>
              <option value="archived">Archived</option>
            </select>
          </div>
          {loading ? (
            <p className="muted">Loading inbox…</p>
          ) : conversations.length === 0 ? (
            <p className="empty">No conversations yet. Replies to campaign emails will appear here.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Lead</th><th>Subject</th><th>Classification</th><th>Status</th></tr>
              </thead>
              <tbody>
                {conversations.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => {
                      setSelected(c);
                      setClassifyResult(null);
                      setClassifyText("");
                    }}
                    style={{ cursor: "pointer", background: selected?.id === c.id ? "var(--surface-2, rgba(0,0,0,0.04))" : undefined }}
                  >
                    <td>{c.lead ? `${c.lead.name ?? ""} ${c.lead.email}`.trim() : "—"}</td>
                    <td>{c.subject ?? "—"}</td>
                    <td>{c.classification ? <span className="badge">{c.classification}</span> : "—"}</td>
                    <td><span className="badge">{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          {!selected ? (
            <p className="empty">Select a conversation to reply, classify or change its status.</p>
          ) : (
            <>
              <h2>{selected.subject ?? "(no subject)"}</h2>
              <p className="muted small">
                {selected.lead ? `${selected.lead.name ?? ""} · ${selected.lead.email}${selected.lead.company ? ` · ${selected.lead.company}` : ""}` : "No lead attached"}
                <br />
                Status: {selected.status}
                {selected.classification ? ` · Classification: ${selected.classification} (${selected.classificationSource ?? "?"})` : ""}
                {selected.assignedTo ? ` · Assigned to: ${selected.assignedTo}` : ""}
              </p>
              <div className="form-row">
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void setStatus(selected, "starred")}>Star</button>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void setStatus(selected, "archived")}>Archive</button>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => void setStatus(selected, "open")}>Reopen</button>
              </div>

              <h3 style={{ marginTop: "1rem" }}>Reply</h3>
              <form onSubmit={sendReply}>
                <textarea
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  rows={5}
                  placeholder="Write your reply…"
                  required
                  style={{ width: "100%" }}
                />
                <button className="btn" type="submit" disabled={sending} style={{ marginTop: "0.5rem" }}>
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </form>
              <p className="muted small">Sent through the conversation&apos;s connected account. If no account is connected, sending is refused — nothing is faked as sent.</p>

              <h3 style={{ marginTop: "1rem" }}>Classify reply</h3>
              <textarea
                value={classifyText}
                onChange={(e) => setClassifyText(e.target.value)}
                rows={3}
                placeholder="Paste the lead's reply text here (leave blank to classify the subject)…"
                style={{ width: "100%" }}
              />
              <button className="btn btn-secondary" type="button" onClick={() => void classifySelected()} style={{ marginTop: "0.5rem" }}>
                Classify (heuristic)
              </button>
              {classifyResult && (
                <p className="small" style={{ marginTop: "0.5rem" }}>
                  Classification: <span className="badge">{classifyResult.classification}</span> · source: {classifyResult.source}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
