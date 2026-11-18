// Campaigns — list / create / pause-resume-stop-archive / sequences / assign leads.
"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../_components/AppShell";

interface Campaign {
  id: string;
  name: string;
  status: string;
  timezone: string;
  dailyLimit: number;
  createdAt: number;
}

interface Step {
  id: string;
  step: number;
  subject: string;
  body: string;
  delayDays: number;
  delayMinutes: number;
  businessDaysOnly: number;
  variant: string;
}

interface LeadRow {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok) throw new Error(j.message || j.error || `Request failed (${r.status})`);
  return j;
}

const STATUS_ACTIONS: { status: string; label: string }[] = [
  { status: "active", label: "Activate" },
  { status: "paused", label: "Pause" },
  { status: "stopped", label: "Stop" },
  { status: "archived", label: "Archive" },
];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [dailyLimit, setDailyLimit] = useState("50");
  const [creating, setCreating] = useState(false);

  const [selected, setSelected] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [stepForm, setStepForm] = useState({ subject: "", body: "", delayDays: "2", delayMinutes: "0" });
  const [assignLeads, setAssignLeads] = useState<LeadRow[]>([]);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState(false);
  const [assignReport, setAssignReport] = useState<{ added: number; skipped: { leadId: string; reason: string }[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const j = await api<{ campaigns: Campaign[] }>("/api/campaigns?limit=100");
      setCampaigns(j.campaigns);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load campaigns.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadSteps = useCallback(async (id: string) => {
    setStepsLoading(true);
    try {
      const j = await api<{ steps: Step[] }>(`/api/campaigns/${id}/sequences`);
      setSteps(j.steps);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load steps.");
    } finally {
      setStepsLoading(false);
    }
  }, []);

  const loadAssignLeads = useCallback(async () => {
    try {
      const j = await api<{ leads: LeadRow[] }>("/api/leads?limit=100");
      setAssignLeads(j.leads);
    } catch {
      // Assign panel is optional; sequences still work without it.
    }
  }, []);

  function select(c: Campaign) {
    setSelected(c);
    setAssignReport(null);
    setChecked(new Set());
    void loadSteps(c.id);
    void loadAssignLeads();
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      await api("/api/campaigns", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), dailyLimit: Number(dailyLimit) || 50 }),
      });
      setName("");
      setNotice("Campaign created as a draft. Add sequence steps, assign leads, then Activate.");
      void load();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not create campaign.");
    } finally {
      setCreating(false);
    }
  }

  async function setStatus(c: Campaign, status: string) {
    setError(null);
    try {
      const j = await api<{ campaign: Campaign; enqueued?: number }>(`/api/campaigns/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setNotice(
        status === "active"
          ? `Campaign activated — ${j.enqueued ?? 0} lead(s) queued for step 1.`
          : `Campaign ${status}.`,
      );
      if (selected?.id === c.id) setSelected(j.campaign);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update campaign.");
    }
  }

  async function deleteCampaign(c: Campaign) {
    if (!confirm(`Delete campaign "${c.name}" and its steps? Sent messages are kept.`)) return;
    try {
      await api(`/api/campaigns/${c.id}`, { method: "DELETE" });
      if (selected?.id === c.id) setSelected(null);
      setNotice("Campaign deleted.");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete campaign.");
    }
  }

  async function addStep(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    try {
      await api(`/api/campaigns/${selected.id}/sequences`, {
        method: "POST",
        body: JSON.stringify({
          subject: stepForm.subject,
          body: stepForm.body,
          delayDays: Number(stepForm.delayDays) || 0,
          delayMinutes: Number(stepForm.delayMinutes) || 0,
          businessDaysOnly: true,
        }),
      });
      setStepForm({ subject: "", body: "", delayDays: "2", delayMinutes: "0" });
      setNotice("Step added.");
      void loadSteps(selected.id);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not add step.");
    }
  }

  async function assignSelected() {
    if (!selected || checked.size === 0) return;
    setAssigning(true);
    setError(null);
    setAssignReport(null);
    try {
      const j = await api<{ added: number; skipped: { leadId: string; reason: string }[] }>(
        `/api/campaigns/${selected.id}/leads`,
        { method: "POST", body: JSON.stringify({ leadIds: [...checked] }) },
      );
      setAssignReport(j);
      setNotice(`Assigned: ${j.added} added, ${j.skipped.length} skipped.`);
      setChecked(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not assign leads.");
    } finally {
      setAssigning(false);
    }
  }

  return (
    <AppShell current="/campaigns" title="Campaigns" subtitle="Multi-step sequences with stop-on-reply, bounce and unsubscribe.">
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok-text">{notice}</p>}

      <div className="card">
        <h2>New campaign</h2>
        <form onSubmit={createCampaign} className="form-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name *" required />
          <input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} placeholder="Daily limit" type="number" min={1} style={{ width: "8rem" }} />
          <button className="btn" type="submit" disabled={creating}>{creating ? "Creating…" : "Create draft"}</button>
        </form>
      </div>

      <div className="card">
        <h2>All campaigns ({campaigns.length})</h2>
        {loading ? (
          <p className="muted">Loading campaigns…</p>
        ) : campaigns.length === 0 ? (
          <p className="empty">No campaigns yet. Create a draft above.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Status</th><th>Daily limit</th><th>Timezone</th><th></th></tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={selected?.id === c.id ? { background: "var(--surface-2, rgba(0,0,0,0.04))" } : undefined}>
                  <td>{c.name}</td>
                  <td><span className="badge">{c.status}</span></td>
                  <td>{c.dailyLimit}/day</td>
                  <td>{c.timezone}</td>
                  <td>
                    <div className="form-row">
                      <button className="btn btn-sm btn-secondary" type="button" onClick={() => select(c)}>Steps & leads</button>
                      {STATUS_ACTIONS.filter((a) => a.status !== c.status).map((a) => (
                        <button key={a.status} className="btn btn-sm btn-ghost" type="button" onClick={() => void setStatus(c, a.status)}>
                          {a.label}
                        </button>
                      ))}
                      <button className="btn btn-sm btn-danger" type="button" onClick={() => void deleteCampaign(c)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <div className="card">
          <h2>{selected.name} — sequence & leads</h2>
          <p className="muted small">
            Status: {selected.status} · Daily limit: {selected.dailyLimit} · Timezone: {selected.timezone}.
            Activating queues step 1 for every pending lead; sending is done by the send-queue worker.
          </p>
          {stepsLoading ? (
            <p className="muted">Loading steps…</p>
          ) : steps.length === 0 ? (
            <p className="empty">No steps yet — add the first email below.</p>
          ) : (
            <table>
              <thead>
                <tr><th>Step</th><th>Subject</th><th>Delay</th><th>Variant</th></tr>
              </thead>
              <tbody>
                {steps.map((s) => (
                  <tr key={s.id}>
                    <td>{s.step}</td>
                    <td>{s.subject}</td>
                    <td>{s.delayDays}d {s.delayMinutes}m{s.businessDaysOnly === 1 ? " (business days)" : ""}</td>
                    <td>{s.variant}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <form onSubmit={addStep} style={{ marginTop: "0.75rem" }}>
            <div className="form-row">
              <input value={stepForm.subject} onChange={(e) => setStepForm({ ...stepForm, subject: e.target.value })} placeholder="Subject *" required style={{ flex: 2 }} />
              <input value={stepForm.delayDays} onChange={(e) => setStepForm({ ...stepForm, delayDays: e.target.value })} placeholder="Delay days" type="number" min={0} style={{ width: "7rem" }} />
              <input value={stepForm.delayMinutes} onChange={(e) => setStepForm({ ...stepForm, delayMinutes: e.target.value })} placeholder="Delay min" type="number" min={0} style={{ width: "7rem" }} />
            </div>
            <textarea
              value={stepForm.body}
              onChange={(e) => setStepForm({ ...stepForm, body: e.target.value })}
              placeholder={"Hi {{first_name}},\n\n…"}
              rows={4}
              required
              style={{ width: "100%", marginTop: "0.5rem" }}
            />
            <p className="muted small">Placeholders: {"{{first_name}}"}, {"{{last_name}}"}, {"{{company}}"}, {"{{job_title}}"}, {"{{email}}"}.</p>
            <button className="btn btn-secondary" type="submit">Add step</button>
          </form>

          <h3 style={{ marginTop: "1.25rem" }}>Assign leads</h3>
          {assignLeads.length === 0 ? (
            <p className="empty">No leads to assign — add leads on the Leads page first.</p>
          ) : (
            <>
              <div style={{ maxHeight: "16rem", overflow: "auto" }}>
                <table>
                  <tbody>
                    {assignLeads.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <input
                            type="checkbox"
                            checked={checked.has(l.id)}
                            onChange={(e) => {
                              const next = new Set(checked);
                              if (e.target.checked) next.add(l.id);
                              else next.delete(l.id);
                              setChecked(next);
                            }}
                          />
                        </td>
                        <td>{`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "—"}</td>
                        <td>{l.email}</td>
                        <td>{l.company ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button className="btn" type="button" disabled={assigning || checked.size === 0} onClick={() => void assignSelected()} style={{ marginTop: "0.5rem" }}>
                {assigning ? "Assigning…" : `Assign ${checked.size} lead(s)`}
              </button>
              {assignReport && assignReport.skipped.length > 0 && (
                <ul className="small" style={{ marginTop: "0.5rem" }}>
                  {assignReport.skipped.map((s, i) => (
                    <li key={i}>Skipped {s.leadId}: {s.reason}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </AppShell>
  );
}
