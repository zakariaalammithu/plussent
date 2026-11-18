// PlusSent reset-password page (?token=...). Posts the token + new password
// to /api/auth/reset. Shows an error when the token is missing or expired.
"use client";

import { Suspense, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(!token ? "This reset link is missing its token. Request a new one from the forgot-password page." : null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (res.ok && data.ok) {
        setDone(true);
        setTimeout(() => router.push("/login"), 2000);
      } else if (data.error === "invalid_or_expired_token") {
        setError("This reset link is invalid or has expired. Request a new one.");
      } else {
        setError("Could not reset the password. Try again.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Set a new password</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Your new password must be at least 8 characters.</p>
      {done ? (
        <p role="status" style={{ background: "#e6f4ea", color: "#137333", padding: 12, borderRadius: 8 }}>
          Password updated. Redirecting to sign in…
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          {error && (
            <p role="alert" style={{ background: "#fde8e8", color: "#9b1c1c", padding: 10, borderRadius: 8 }}>
              {error}
            </p>
          )}
          <label>
            New password
            <input style={inputStyle} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          </label>
          <label>
            Confirm new password
            <input style={inputStyle} type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </label>
          <button
            type="submit"
            disabled={busy || !token}
            style={{ width: "100%", padding: 12, borderRadius: 8, border: 0, background: "#0a6ed1", color: "#fff", fontSize: 16, cursor: busy ? "wait" : "pointer" }}
          >
            {busy ? "Updating…" : "Reset password"}
          </button>
        </form>
      )}
      <p style={{ marginTop: 20, fontSize: 14, color: "#555" }}>
        <a href="/login">Back to sign in</a>
      </p>
    </main>
  );
}

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
