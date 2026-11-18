// PlusSent email-verification page (?token=...). Verifies the token on load
// via /api/auth/verify and shows the result. Also accepts POST verification
// links that land here from the email.
"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

function VerifyForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [state, setState] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("Verifying your email…");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMessage("This verification link is missing its token.");
      return;
    }
    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json()) as { error?: string; ok?: boolean };
        if (res.ok && data.ok) {
          setState("ok");
          setMessage("Your email is verified. You can now use PlusSent.");
        } else {
          setState("error");
          setMessage("This verification link is invalid or has expired. Sign in and request a new one.");
        }
      })
      .catch(() => {
        setState("error");
        setMessage("Network error. Please try again.");
      });
  }, [token]);

  return (
    <main style={{ maxWidth: 420, margin: "80px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, marginBottom: 16 }}>Email verification</h1>
      <p
        role="status"
        style={{
          background: state === "ok" ? "#e6f4ea" : state === "error" ? "#fde8e8" : "#eef4fb",
          color: state === "ok" ? "#137333" : state === "error" ? "#9b1c1c" : "#111",
          padding: 12,
          borderRadius: 8,
        }}
      >
        {message}
      </p>
      <p style={{ marginTop: 20, fontSize: 14, color: "#555" }}>
        <a href="/login">Go to sign in</a> · <a href="/dashboard">Go to dashboard</a>
      </p>
    </main>
  );
}

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyForm />
    </Suspense>
  );
}
