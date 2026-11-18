"use client";
import { useState } from "react";
export default function LeadFinderPage() {
  const [msg, setMsg] = useState("");
  return (<main style={{ padding: 24 }}>
    <h1>Lead Finder</h1>
    <p>Lead Finder searches an external B2B database. No enrichment provider is connected yet — this page does not return fake leads.</p>
    <p>To use Lead Finder, connect an enrichment provider in Settings → Integrations (Apollo, Clay, ZoomInfo or similar) once its API key is configured.</p>
    <p>Until then, the working way to add leads is CSV import:</p>
    <p><a href="/leads">Go to Leads → Import CSV</a></p>
    {msg && <p>{msg}</p>}
    <button onClick={() => setMsg("Lead Finder is awaiting an enrichment provider — see Settings → Integrations.")}>Search the database</button>
  </main>);
}
