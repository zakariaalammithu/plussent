import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function dbUrl() {
  if (process.env.TURSO_DATABASE_URL) return process.env.TURSO_DATABASE_URL;
  const u = process.env.DATABASE_URL || "file:./data/plussent.db";
  return u;
}
const client = createClient({ url: dbUrl(), authToken: process.env.TURSO_AUTH_TOKEN || undefined });
export const db = drizzle(client, { schema });
export { schema };
export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
export const now = () => Date.now();
