// PlusSent migrations — creates every table from src/lib/db/schema.ts.
// Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// Run: npm run db:migrate   (tsx scripts/migrate.ts)
// Local DB defaults to file:./data/plussent.db; hosted via TURSO_* env vars.
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { TABLES } from "../src/lib/db/tables";

export async function ensureSchema() {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./data/plussent.db";
  if (url.startsWith("file:")) {
    const file = url.replace(/^file:/, "");
    mkdirSync(dirname(resolve(file)), { recursive: true });
  }
  const { getDbClient } = await import("../src/lib/db");
  for (const sql of TABLES) {
    await getDbClient().execute(sql);
  }
  return TABLES.filter((s) => s.startsWith("CREATE TABLE")).length;
}

async function main() {
  const n = await ensureSchema();
  console.log(`[plussent] migrate: ok — ${n} tables ensured (idempotent).`);
}

// Only run as a CLI (`npm run db:migrate`). This file is also imported by
// src/instrumentation.ts for ensureSchema(); an import must never run the
// migration or call process.exit() as a side effect.
const invokedAsScript =
  typeof process.argv[1] === "string" &&
  (process.argv[1].endsWith("migrate.ts") || process.argv[1].endsWith("migrate.js"));
if (invokedAsScript) {
  main().catch((err) => {
    console.error("[plussent] migrate: FAILED", err);
    process.exit(1);
  });
}
