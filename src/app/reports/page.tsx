"use client";
import { useState } from "react";
export default function ReportsPage() {
  const [msg, setMsg] = useState("");
  async function downloadCsv() {
    const r = await fetch("/api/analytics");
    if (!r.ok) { setMsg("Could not load analytics."); return; }
    const j = await r.json();
    const rows = [["metric", "value"], ...Object.entries(j.totals || {}).map(([k, v]) => [k, String(v)])];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "plasesent-analytics.csv"; a.click();
    setMsg("Downloaded plasesent-analytics.csv (real data from your workspace).");
  }
  return (<main style={{ padding: 24 }}>
    <h1>Reports</h1>
    <p>Export workspace analytics as CSV. All figures come from your real database records — zeros until data exists.</p>
    <button onClick={downloadCsv}>Download analytics CSV</button>
    {msg && <p>{msg}</p>}
    <p>PDF export is not implemented yet.</p>
  </main>);
}
