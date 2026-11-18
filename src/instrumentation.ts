// Runs once when the Next.js server starts (Node runtime only).
// Ensures the DB schema exists on a fresh database (e.g. first Vercel deploy
// with a fresh Turso DB) instead of 500ing on the first signup.
//
// NOTE: the dynamic import of ../scripts/migrate MUST stay inside the
// `if (process.env.NEXT_RUNTIME === "nodejs")` block. Next compiles this file
// for both the Node and Edge runtimes; webpack eliminates the whole block in
// the Edge build (where `fs`/`path` cannot resolve), but an early-return
// rewrite (`if (NEXT_RUNTIME !== "nodejs") return;`) does NOT get pruned the
// same way and breaks the build with "Can't resolve 'fs'".
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // NEVER during `next build`: page-data collection runs on the build machine
    // with no database and a read-only filesystem — a schema check there used
    // to fail the whole Vercel deployment.
    if (process.env.NEXT_PHASE === "phase-production-build") return;
    // On Vercel with no DB configured there is nothing to migrate against
    // (a local file DB cannot work on serverless); skip instead of failing.
    if (process.env.VERCEL && !process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
      console.log("[plussent] startup schema check skipped: no database configured (set TURSO_DATABASE_URL).");
      return;
    }
    try {
      const { ensureSchema } = await import("../scripts/migrate");
      const n = await ensureSchema();
      console.log(`[plussent] startup schema check: ${n} tables ensured.`);
    } catch (err) {
      console.error("[plussent] startup schema check FAILED", err);
    }
  }
}
