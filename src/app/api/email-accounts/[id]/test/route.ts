// POST /api/email-accounts/[id]/test — re-verify the stored SMTP connection
// (decrypts stored creds server-side only) and updates status/lastError.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getWorkspaceAuth, notFound } from "@/lib/api-auth";
import { decryptSecret } from "@/lib/crypto";
import { db, now } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { serializeAccount, testSmtpConnection } from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const [row] = await db
    .select()
    .from(emailAccounts)
    .where(and(eq(emailAccounts.id, id), eq(emailAccounts.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!row) return notFound("email_account_not_found");
  let creds: { host: string; port: number; secure: boolean; user: string; pass: string };
  try {
    creds = JSON.parse(decryptSecret(row.encryptedCredentials)) as typeof creds;
  } catch {
    await db
      .update(emailAccounts)
      .set({ status: "error", lastError: "stored credentials could not be decrypted", updatedAt: now() })
      .where(eq(emailAccounts.id, id));
    return NextResponse.json(
      { ok: false, status: "error", error: "stored_credentials_unreadable" },
      { status: 500 },
    );
  }
  const check = await testSmtpConnection(creds);
  await db
    .update(emailAccounts)
    .set({
      status: check.ok ? "connected" : "error",
      lastError: check.ok ? null : check.error ?? "smtp_verify_failed",
      updatedAt: now(),
    })
    .where(eq(emailAccounts.id, id));
  const [updated] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, id)).limit(1);
  return NextResponse.json({
    ok: check.ok,
    status: updated?.status,
    error: check.error ?? null,
    account: updated ? serializeAccount(updated) : null,
  });
}
