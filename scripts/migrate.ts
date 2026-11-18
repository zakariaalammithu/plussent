// PlaseSent migrations — creates every table from src/lib/db/schema.ts.
// Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
// Run: npm run db:migrate   (tsx scripts/migrate.ts)
// Local DB defaults to file:./data/plasesent.db; hosted via TURSO_* env vars.
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { TABLES } from "../src/lib/db/tables";

export async function ensureSchema() {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./data/plasesent.db";
  if (url.startsWith("file:")) {
    const file = url.replace(/^file:/, "");
    mkdirSync(dirname(resolve(file)), { recursive: true });
  }
  const { db } = await import("../src/lib/db");
  for (const sql of TABLES) {
    await db.$client.execute(sql);
  }
  return TABLES.filter((s) => s.startsWith("CREATE TABLE")).length;
}

async function main() {
  const n = await ensureSchema();
  console.log(`[plasesent] migrate: ok — ${n} tables ensured (idempotent).`);
}

main().catch((err) => {
  console.error("[plasesent] migrate: FAILED", err);
  process.exit(1);
});
