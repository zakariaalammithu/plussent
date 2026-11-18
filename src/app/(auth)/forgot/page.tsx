// PlusSent forgot-password page. Posts to /api/auth/forgot; always shows the
// same generic message (the API never reveals whether the email exists).
"use client";

import { useState, type FormEvent } from "react";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "10px 12px",
  marginBottom: 12,
  border: "1px solid #ccc",
  borderRadius: 8,
  fontSize: 15,
  boxSizing: "border-box",
};

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error === "too_many_requests" ? "Too many requests. Wait a minute and try again." : "Something went wrong. Try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Forgot your password?</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>We will send a reset link to your email.</p>
      {done ? (
        <p role="status" style={{ background: "#e6f4ea", color: "#137333", padding: 12, borderRadius: 8 }}>
          If an account exists for this email, a reset link has been sent. The link expires in 1 hour.
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          {error && (
            <p role="alert" style={{ background: "#fde8e8", color: "#9b1c1c", padding: 10, borderRadius: 8 }}>
              {error}
            </p>
          )}
          <label>
            Email
            <input style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: 0, background: "#0a6ed1", color: "#fff", fontSize: 16, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
        </form>
      )}
      <p style={{ marginTop: 20, fontSize: 14, color: "#555" }}>
        <a href="/login">Back to sign in</a>
      </p>
    </main>
  );
}
