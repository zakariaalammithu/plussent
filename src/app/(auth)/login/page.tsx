// PlaseSent sign-in page. Posts to /api/auth/login; supports the TOTP second
// factor (server replies totp_required, then this form asks for the 6-digit code).
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/dashboard";
  const oauthError = searchParams.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(oauthError ? `Sign-in with Google/Microsoft failed (${oauthError}).` : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe, ...(needsTotp ? { totpCode } : {}) }),
      });
      const data = (await res.json()) as { error?: string; ok?: boolean };
      if (res.ok && data.ok) {
        router.push(next);
        router.refresh();
        return;
      }
      if (data.error === "totp_required") {
        setNeedsTotp(true);
        setError("Enter the 6-digit code from your authenticator app.");
      } else if (data.error === "invalid_totp") {
        setError("That code is incorrect. Try again.");
      } else if (data.error === "too_many_requests") {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setError("Invalid email or password.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Sign in to PlaseSent</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Cold email, done properly.</p>
      {error && (
        <p role="alert" style={{ background: "#fde8e8", color: "#9b1c1c", padding: 10, borderRadius: 8 }}>
          {error}
        </p>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password
          <input style={inputStyle} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {needsTotp && (
          <label>
            Authenticator code
            <input style={inputStyle} type="text" inputMode="numeric" maxLength={6} required value={totpCode} onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))} autoComplete="one-time-code" />
          </label>
        )}
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, fontSize: 14 }}>
          <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} /> Remember me (90 days)
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: 0, background: "#0a6ed1", color: "#fff", fontSize: 16, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Signing in…" : needsTotp ? "Verify code" : "Sign in"}
        </button>
      </form>
      <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
        <a href="/api/auth/google" style={{ textAlign: "center", padding: 10, border: "1px solid #ccc", borderRadius: 8, textDecoration: "none", color: "#111" }}>
          Continue with Google
        </a>
        <a href="/api/auth/microsoft" style={{ textAlign: "center", padding: 10, border: "1px solid #ccc", borderRadius: 8, textDecoration: "none", color: "#111" }}>
          Continue with Microsoft
        </a>
      </div>
      <p style={{ marginTop: 20, fontSize: 14, color: "#555" }}>
        No account? <a href="/signup">Create one</a> · <a href="/forgot">Forgot password?</a>
      </p>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
