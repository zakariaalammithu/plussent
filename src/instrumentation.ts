// Runs once when the Next.js server starts (Node runtime only).
// Ensures the DB schema exists on a fresh database (e.g. first Vercel deploy
// with a fresh Turso DB) instead of 500ing on the first signup.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureSchema } = await import("../scripts/migrate");
      const n = await ensureSchema();
      console.log(`[plussent] startup schema check: ${n} tables ensured.`);
    } catch (err) {
      console.error("[plussent] startup schema check FAILED", err);
    }
  }
}
