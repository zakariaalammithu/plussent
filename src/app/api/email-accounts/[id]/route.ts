// GET /api/email-accounts/[id] — one account (no credentials).
// DELETE — disconnect/remove the account. Queued messages that referenced it
// are left queued; the worker will not send them without an account.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getWorkspaceAuth, notFound } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { serializeAccount } from "@/lib/smtp";

export const dynamic = "force-dynamic";

async function findAccount(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, id), eq(emailAccounts.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findAccount(auth.workspaceId, id);
  if (!row) return notFound("email_account_not_found");
  return NextResponse.json({ ok: true, account: serializeAccount(row) });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findAccount(auth.workspaceId, id);
  if (!row) return notFound("email_account_not_found");
  await db.delete(emailAccounts).where(eq(emailAccounts.id, id));
  return NextResponse.json({ ok: true, deleted: true, id });
}
