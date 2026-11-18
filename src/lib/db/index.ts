// PlusSent DB access — LAZY by design.
//
// Importing this module must NEVER open a database connection: Vercel runs
// `next build` ("Collecting page data") on a build machine with no DB file
// and a read-only filesystem, and an eager createClient() there used to fail
// the whole deployment ("Failed to collect page data for /api/admin/stats").
// The client is created on the first real query only.
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

export function dbUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  const u = process.env.DATABASE_URL || "file:./data/plussent.db";
  return u;
}

/** True when a database URL is explicitly configured (Turso or DATABASE_URL). */
export function isDbConfigured() {
  return Boolean(process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL);
}

type Db = LibSQLDatabase<typeof schema>;

let client: Client | null = null;
let drizzleDb: Db | null = null;

/**
 * Create (once) and return the drizzle client. Throws a clear error instead
 * of a libSQL connection failure when running on Vercel with no DB configured:
 * a local file DB cannot work on serverless (read-only FS, no shared disk),
 * so production needs TURSO_DATABASE_URL + TURSO_AUTH_TOKEN.
 */
export function getDb(): Db {
  if (drizzleDb) return drizzleDb;
  if (process.env.VERCEL && !isDbConfigured()) {
    throw new Error(
      "database not configured: set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN (Vercel → Settings → Environment Variables), then redeploy",
    );
  }
  client = createClient({ url: dbUrl(), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  drizzleDb = drizzle(client, { schema });
  return drizzleDb;
}

/** For scripts that need the raw libSQL client (migrations). */
export function getDbClient(): Client {
  getDb();
  return client as Client;
}

// Lazy proxy over the drizzle instance: every `db.select/insert/...` call
// resolves the real client on first use, with methods bound to it. Importing
// this module (as every API route and page does) opens no connection.
export const db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb() as unknown as Record<string | symbol, unknown>;
    const value = real[prop];
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
  has(_target, prop) {
    return prop in getDb();
  },
});

export { schema };
export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
export const now = () => Date.now();
