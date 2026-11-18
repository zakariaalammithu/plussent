// PlusSent sign-up page. Posts to /api/auth/signup; on success the user is
// signed in and told honestly whether the verification email was actually sent.
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName || undefined, email, password }),
      });
      const data = (await res.json()) as {
        error?: string;
        ok?: boolean;
        verificationEmailSent?: boolean;
        verificationEmailReason?: string;
      };
      if (res.ok && data.ok) {
        if (data.verificationEmailSent) {
          setNotice("Account created. A verification email is on its way — check your inbox.");
        } else {
          setNotice(
            `Account created. We could not send the verification email yet (${data.verificationEmailReason ?? "email not configured"}). You can still use PlusSent.`,
          );
        }
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 2500);
        return;
      }
      if (data.error === "email_in_use") setError("An account with this email already exists. Try signing in.");
      else setError("Could not create the account. Check the fields and try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 4 }}>Create your PlusSent account</h1>
      <p style={{ color: "#555", marginBottom: 24 }}>Free plan to start — your own workspace is created automatically.</p>
      {error && (
        <p role="alert" style={{ background: "#fde8e8", color: "#9b1c1c", padding: 10, borderRadius: 8 }}>
          {error}
        </p>
      )}
      {notice && (
        <p role="status" style={{ background: "#e6f4ea", color: "#137333", padding: 10, borderRadius: 8 }}>
          {notice}
        </p>
      )}
      <form onSubmit={onSubmit}>
        <label>
          Full name
          <input style={inputStyle} type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />
        </label>
        <label>
          Email
          <input style={inputStyle} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </label>
        <label>
          Password (at least 8 characters)
          <input style={inputStyle} type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{ width: "100%", padding: 12, borderRadius: 8, border: 0, background: "#0a6ed1", color: "#fff", fontSize: 16, cursor: busy ? "wait" : "pointer" }}
        >
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p style={{ marginTop: 20, fontSize: 14, color: "#555" }}>
        Already have an account? <a href="/login">Sign in</a>
      </p>
    </main>
  );
}
