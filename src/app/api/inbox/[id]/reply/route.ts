// POST /api/inbox/[id]/reply — send a manual reply to the lead via the
// conversation's sending account (or the workspace's first connected account).
// Sends ONLY through a real SMTP account; with no account configured it returns
// 400 smtp_not_configured and records nothing as sent. The reply is recorded
// as an email_message (status sent) + an email_event row.
import { and, asc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { conversations, emailAccounts, emailEvents, emailMessages, leads } from "@/lib/db/schema";
import { sendViaAccount } from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const replySchema = z.object({
  body: z.string().trim().min(1, "body is required").max(100000),
  subject: z.string().trim().max(500).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!conv) return notFound("conversation_not_found");
  if (!conv.leadId) {
    return NextResponse.json(
      { error: "no_lead", message: "This conversation has no lead to reply to." },
      { status: 400 },
    );
  }
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, conv.leadId), eq(leads.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!lead) return notFound("lead_not_found");

  let account: typeof emailAccounts.$inferSelect | null = null;
  if (conv.emailAccountId) {
    const [a] = await db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.id, conv.emailAccountId), eq(emailAccounts.workspaceId, auth.workspaceId)))
      .limit(1);
    account = a ?? null;
  }
  if (!account) {
    const [a] = await db
      .select()
      .from(emailAccounts)
      .where(and(eq(emailAccounts.workspaceId, auth.workspaceId), eq(emailAccounts.status, "connected")))
      .orderBy(asc(emailAccounts.createdAt))
      .limit(1);
    account = a ?? null;
  }
  if (!account) {
    return NextResponse.json(
      {
        error: "smtp_not_configured",
        message: "No connected sending account in this workspace. Connect an email account first — nothing was sent.",
      },
      { status: 400 },
    );
  }

  const subject = parsed.data.subject ?? (conv.subject ? `Re: ${conv.subject}` : "Re: your email");
  const result = await sendViaAccount(account, {
    to: lead.email,
    subject,
    text: parsed.data.body,
  });
  if (!result.sent) {
    return NextResponse.json(
      { error: "send_failed", message: "The reply could not be sent.", detail: result.reason },
      { status: 502 },
    );
  }

  const messageId = makeId("msg");
  await db.insert(emailMessages).values({
    id: messageId,
    workspaceId: auth.workspaceId,
    campaignId: null,
    campaignLeadId: null,
    leadId: lead.id,
    emailAccountId: account.id,
    subject,
    body: parsed.data.body,
    status: "sent",
    idempotencyKey: `reply_${conv.id}_${now()}`,
    error: null,
    sentAt: now(),
    openedAt: null,
    clickedAt: null,
    createdAt: now(),
  });
  await db.insert(emailEvents).values({
    id: makeId("evt"),
    workspaceId: auth.workspaceId,
    messageId,
    type: "sent",
    metadata: JSON.stringify({ conversationId: conv.id, manualReply: true }),
    createdAt: now(),
  });
  await db.update(conversations).set({ updatedAt: now() }).where(eq(conversations.id, id));
  return NextResponse.json({ ok: true, messageId, sent: true });
}
