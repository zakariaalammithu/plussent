// Leads — list / search / create / delete / CSV import (Module B UI).
"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "../_components/AppShell";

interface Lead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  company: string | null;
  jobTitle: string | null;
  verificationStatus: string;
  createdAt: number;
}

interface ImportReport {
  total: number;
  imported: number;
  invalid: { row: number; reason: string; email?: string }[];
  skippedEmpty: number;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!r.ok) throw new Error((j as { message?: string; error?: string }).message || (j as { error?: string }).error || `Request failed (${r.status})`);
  return j;
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [listId, setListId] = useState("");
  const [newLead, setNewLead] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [saving, setSaving] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (p: number, q: string, l: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(p), limit: "25" });
      if (q) params.set("search", q);
      if (l) params.set("listId", l);
      const j = await api<{ leads: Lead[]; total: number }>(`/api/leads?${params}`);
      setLeads(j.leads);
      setTotal(j.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLists = useCallback(async () => {
    try {
      const j = await api<{ lists: { id: string; name: string }[] }>("/api/leads/lists?limit=100");
      setLists(j.lists);
    } catch {
      // Lists are optional; the leads table still works without them.
    }
  }, []);

  useEffect(() => {
    void load(page, search, listId);
  }, [load, page, search, listId]);
  useEffect(() => {
    void loadLists();
  }, [loadLists]);

  async function createLead(e: React.FormEvent) {
    e.preventDefault();
    if (!newLead.email.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/leads", { method: "POST", body: JSON.stringify(newLead) });
      setNewLead({ firstName: "", lastName: "", email: "", company: "" });
      setNotice("Lead added.");
      void load(page, search, listId);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Could not add lead.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead(id: string) {
    if (!confirm("Delete this lead?")) return;
    try {
      await api(`/api/leads/${id}`, { method: "DELETE" });
      setNotice("Lead deleted.");
      void load(page, search, listId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete lead.");
    }
  }

  async function runImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) return;
    setImporting(true);
    setError(null);
    setReport(null);
    try {
      // No explicit mapping: headers are auto-matched to lead fields.
      const j = await api<ImportReport>("/api/leads/import", {
        method: "POST",
        body: JSON.stringify({ csv: csvText, listId: listId || undefined }),
      });
      setReport(j);
      setNotice(`Import finished: ${j.imported} imported, ${j.invalid.length} invalid.`);
      void load(1, search, listId);
      setPage(1);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  function onCsvFile(f: File | undefined) {
    if (!f) return;
    void f.text().then((t) => setCsvText(t));
  }

  const pages = Math.max(1, Math.ceil(total / 25));

  return (
    <AppShell current="/leads" title="Leads" subtitle="Workspace leads — verified data only, blanks stay blank.">
      {error && <p className="error">{error}</p>}
      {notice && <p className="ok-text">{notice}</p>}

      <div className="card">
        <h2>Add a lead</h2>
        <form onSubmit={createLead} className="form-row">
          <input value={newLead.firstName} onChange={(e) => setNewLead({ ...newLead, firstName: e.target.value })} placeholder="First name" />
          <input value={newLead.lastName} onChange={(e) => setNewLead({ ...newLead, lastName: e.target.value })} placeholder="Last name" />
          <input value={newLead.email} onChange={(e) => setNewLead({ ...newLead, email: e.target.value })} placeholder="Email *" type="email" required />
          <input value={newLead.company} onChange={(e) => setNewLead({ ...newLead, company: e.target.value })} placeholder="Company" />
          <button className="btn" type="submit" disabled={saving}>{saving ? "Adding…" : "Add lead"}</button>
        </form>
      </div>

      <div className="card">
        <h2>Import CSV</h2>
        <p className="muted small">Paste CSV (first row = headers: email, firstName, lastName, company, …) or choose a file. Invalid rows are reported below — never silently dropped.</p>
        <form onSubmit={runImport}>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={5} placeholder={"email,firstName,lastName,company\njane@example.com,Jane,Doe,Acme"} style={{ width: "100%" }} />
          <div className="form-row" style={{ marginTop: "0.5rem" }}>
            <input type="file" accept=".csv,text/csv" onChange={(e) => onCsvFile(e.target.files?.[0])} />
            <button className="btn btn-secondary" type="submit" disabled={importing || !csvText.trim()}>
              {importing ? "Importing…" : "Import CSV"}
            </button>
          </div>
        </form>
        {report && (
          <div style={{ marginTop: "0.75rem" }}>
            <p>
              Total rows: {report.total} · Imported: {report.imported} · Invalid: {report.invalid.length}
              {report.skippedEmpty > 0 ? ` · Empty rows skipped: ${report.skippedEmpty}` : ""}
            </p>
            {report.invalid.length > 0 && (
              <ul className="small">
                {report.invalid.slice(0, 50).map((r, i) => (
                  <li key={i}>Row {r.row || "?"}: {r.reason}</li>
                ))}
                {report.invalid.length > 50 && <li>…and {report.invalid.length - 50} more.</li>}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>All leads ({total})</h2>
        <div className="form-row">
          <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="Search name, email or company" />
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setSearch(searchInput);
              setPage(1);
            }}
          >
            Search
          </button>
          <select value={listId} onChange={(e) => { setListId(e.target.value); setPage(1); }}>
            <option value="">All lists</option>
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        {loading ? (
          <p className="muted">Loading leads…</p>
        ) : leads.length === 0 ? (
          <p className="empty">No leads yet. Add one above or import a CSV.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Company</th><th>Title</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td>{`${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || "—"}</td>
                  <td>{l.email}</td>
                  <td>{l.company ?? "—"}</td>
                  <td>{l.jobTitle ?? "—"}</td>
                  <td><span className="badge">{l.verificationStatus}</span></td>
                  <td><button className="btn btn-sm btn-danger" type="button" onClick={() => void deleteLead(l.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="form-row" style={{ marginTop: "0.75rem" }}>
          <button className="btn btn-secondary btn-sm" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
          <span className="muted small">Page {page} of {pages}</span>
          <button className="btn btn-secondary btn-sm" type="button" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next →</button>
        </div>
      </div>
    </AppShell>
  );
}
