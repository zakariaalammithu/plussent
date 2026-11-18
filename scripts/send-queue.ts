// PlusSent — send-queue worker (Module B).
// Run with:  npm run worker:send-queue   (tsx scripts/send-queue.ts)
//   or on a schedule (cron / Vercel Cron hitting a trigger — not included here).
//
// What it does, in order:
//  1. Enqueue pass: for ACTIVE campaigns, campaign leads whose next step is due
//     get their next sequence step queued as an email_message (see lib/enqueue).
//  2. Send pass: queued messages whose send time is due are sent via nodemailer
//     SMTP through the assigned email account (decrypted creds), respecting the
//     campaign dailyLimit and the account dailyLimit.
//  3. Stop rules: suppressed / bounced / replied / unsubscribed leads are never
//     sent to — their messages are marked failed with the reason.
//  4. Failures: exponential backoff (1m, 2m, 4m, 8m, 16m, capped at 1h), the
//     error + attempt count stored on the message; after 5 attempts it is failed.
//     Backoff state lives in the message `error` field as JSON because the
//     schema has no retry columns — see parseRetryState().
//  5. No SMTP account configured: messages stay queued and "smtp_not_configured"
//     is logged. NOTHING is ever marked sent without a real SMTP send.
import { and, asc, count, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { getStepByNumber, nextSendAt, shouldStop } from "../src/lib/campaigns";
import { db, makeId, now } from "../src/lib/db";
import {
  campaignLeads,
  campaigns,
  emailAccounts,
  emailEvents,
  emailMessages,
  leads,
  sequences,
  suppressions,
} from "../src/lib/db/schema";
import { enqueueStepForLead } from "../src/lib/enqueue";
import { sendViaAccount } from "../src/lib/smtp";

// ---------------------------------------------------------------- pure helpers
export const MAX_ATTEMPTS = 5;
export const BASE_BACKOFF_MS = 60_000;

/** Exponential backoff: 1m, 2m, 4m, 8m, 16m … capped at 1h. */
export function backoffMs(attempt: number): number {
  const a = Math.max(0, Math.floor(attempt));
  return Math.min(3_600_000, BASE_BACKOFF_MS * 2 ** a);
}

export interface RetryState {
  attempts: number;
  nextRetryAt: number | null;
  message: string | null;
}

/** Read the retry state encoded in a message's `error` field (JSON or plain text). */
export function parseRetryState(error: string | null | undefined): RetryState {
  if (!error) return { attempts: 0, nextRetryAt: null, message: null };
  try {
    const v = JSON.parse(error) as { attempts?: number; nextRetryAt?: number; message?: string };
    if (typeof v === "object" && v !== null && ("attempts" in v || "nextRetryAt" in v)) {
      return {
        attempts: Number(v.attempts ?? 0) || 0,
        nextRetryAt: typeof v.nextRetryAt === "number" ? v.nextRetryAt : null,
        message: typeof v.message === "string" ? v.message : null,
      };
    }
  } catch {
    // Plain-text error: no retry state recorded yet.
  }
  return { attempts: 0, nextRetryAt: null, message: error };
}

export function encodeRetryState(state: RetryState): string {
  return JSON.stringify(state);
}

export function startOfDayUtc(ts: number): number {
  const d = new Date(ts);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

// ---------------------------------------------------------------- worker
export interface QueueRunSummary {
  enqueued: number;
  sent: number;
  failed: number;
  skipped: number;
  leftQueued: number;
}

export async function processQueue(): Promise<QueueRunSummary> {
  const startedAt = now();
  const todayStart = startOfDayUtc(startedAt);
  const todayStr = new Date(startedAt).toISOString().slice(0, 10);
  const summary: QueueRunSummary = { enqueued: 0, sent: 0, failed: 0, skipped: 0, leftQueued: 0 };

  // ---- Enqueue pass: due next steps of active campaigns.
  const dueLeads = await db
    .select()
    .from(campaignLeads)
    .where(
      and(
        // status pending (never queued) or sent (previous step delivered, next due)
        inArray(campaignLeads.status, ["pending", "sent"]),
        // Due when nextSendAt has arrived — or was never set (pending step 1).
        or(isNull(campaignLeads.nextSendAt), lte(campaignLeads.nextSendAt, startedAt)),
      ),
    )
    .limit(500);
  for (const cl of dueLeads) {
    const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, cl.campaignId)).limit(1);
    if (!campaign || campaign.status !== "active") continue;
    // A "sent" lead with no further steps is completed, not re-queued.
    if (cl.status === "sent") {
      const steps = await db.select().from(sequences).where(eq(sequences.campaignId, cl.campaignId));
      if (!getStepByNumber(steps, cl.nextStep)) {
        await db.update(campaignLeads).set({ status: "completed" }).where(eq(campaignLeads.id, cl.id));
        continue;
      }
    }
    const r = await enqueueStepForLead({
      workspaceId: campaign.workspaceId,
      campaignId: cl.campaignId,
      campaignLeadId: cl.id,
    });
    if (r.queued) summary.enqueued++;
  }

  // ---- Send pass: queued messages, oldest first.
  const queued = await db
    .select()
    .from(emailMessages)
    .where(eq(emailMessages.status, "queued"))
    .orderBy(asc(emailMessages.createdAt))
    .limit(500);
  if (queued.length === 0) {
    console.log("[plussent] send-queue: no queued messages.");
    return summary;
  }

  const workspaceId = queued[0].workspaceId;
  const suppressedRows = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.workspaceId, workspaceId));
  const suppressed = new Map(suppressedRows.map((s) => [s.email.toLowerCase(), s.reason]));

  const leadIds = [...new Set(queued.map((m) => m.leadId).filter((x): x is string => !!x))];
  const leadRows = leadIds.length
    ? await db.select().from(leads).where(inArray(leads.id, leadIds))
    : [];
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  const clIds = [...new Set(queued.map((m) => m.campaignLeadId).filter((x): x is string => !!x))];
  const clRows = clIds.length
    ? await db.select().from(campaignLeads).where(inArray(campaignLeads.id, clIds))
    : [];
  const clById = new Map(clRows.map((c) => [c.id, c]));

  const campaignIds = [...new Set(queued.map((m) => m.campaignId).filter((x): x is string => !!x))];
  const campaignRows = campaignIds.length
    ? await db.select().from(campaigns).where(inArray(campaigns.id, campaignIds))
    : [];
  const campaignById = new Map(campaignRows.map((c) => [c.id, c]));

  const accountIds = [...new Set(queued.map((m) => m.emailAccountId).filter((x): x is string => !!x))];
  const accountRows = accountIds.length
    ? await db.select().from(emailAccounts).where(inArray(emailAccounts.id, accountIds))
    : [];
  const accountById = new Map(accountRows.map((a) => [a.id, a]));

  // Sent-today counts (start of run) per campaign + per account.
  const sentTodayRows = await db
    .select({
      campaignId: emailMessages.campaignId,
      emailAccountId: emailMessages.emailAccountId,
      n: count(),
    })
    .from(emailMessages)
    .where(and(eq(emailMessages.status, "sent"), gte(emailMessages.sentAt, todayStart)))
    .groupBy(emailMessages.campaignId, emailMessages.emailAccountId);
  const sentByCampaign = new Map<string, number>();
  const sentByAccount = new Map<string, number>();
  for (const r of sentTodayRows) {
    if (r.campaignId) sentByCampaign.set(r.campaignId, (sentByCampaign.get(r.campaignId) ?? 0) + r.n);
    if (r.emailAccountId) sentByAccount.set(r.emailAccountId, (sentByAccount.get(r.emailAccountId) ?? 0) + r.n);
  }

  for (const msg of queued) {
    const cl = msg.campaignLeadId ? clById.get(msg.campaignLeadId) : null;
    const lead = msg.leadId ? leadById.get(msg.leadId) : null;
    const campaign = msg.campaignId ? campaignById.get(msg.campaignId) : null;

    // Backoff: not yet due for a retry.
    const retry = parseRetryState(msg.error);
    if (retry.nextRetryAt && retry.nextRetryAt > startedAt) {
      summary.leftQueued++;
      continue;
    }
    // Sequence timing: the lead's nextSendAt has not arrived yet.
    if (cl?.nextSendAt && cl.nextSendAt > startedAt) {
      summary.leftQueued++;
      continue;
    }
    // Campaign must be active to send.
    if (campaign && campaign.status !== "active") {
      console.log(`[plussent] send-queue: message ${msg.id} left queued — campaign ${campaign.status}.`);
      summary.leftQueued++;
      continue;
    }
    // Stop rules: replied / bounced / unsubscribed / stopped / completed.
    if (cl && shouldStop(cl, "")) {
      await failMessage(msg.id, `skipped: lead ${cl.status}`);
      summary.skipped++;
      continue;
    }
    // Suppression list.
    if (lead) {
      const reason = suppressed.get(lead.email.toLowerCase());
      if (reason) {
        await failMessage(msg.id, `skipped: suppressed (${reason})`);
        if (cl) {
          await db.update(campaignLeads).set({ status: "stopped" }).where(eq(campaignLeads.id, cl.id));
        }
        summary.skipped++;
        continue;
      }
    }
    if (!lead) {
      await failMessage(msg.id, "skipped: lead not found");
      summary.skipped++;
      continue;
    }

    // Sending account.
    const account = msg.emailAccountId ? accountById.get(msg.emailAccountId) : null;
    if (!account) {
      console.log(`[plussent] send-queue: message ${msg.id} left queued — smtp_not_configured (no sending account).`);
      summary.leftQueued++;
      continue;
    }
    // Daily limits.
    if (campaign && (sentByCampaign.get(campaign.id) ?? 0) >= campaign.dailyLimit) {
      console.log(`[plussent] send-queue: campaign ${campaign.id} daily limit reached; message ${msg.id} left queued.`);
      summary.leftQueued++;
      continue;
    }
    if ((sentByAccount.get(account.id) ?? 0) >= account.dailyLimit) {
      console.log(`[plussent] send-queue: account ${account.id} daily limit reached; message ${msg.id} left queued.`);
      summary.leftQueued++;
      continue;
    }

    const result = await sendViaAccount(account, { to: lead.email, subject: msg.subject, text: msg.body });
    if (!result.sent) {
      const attempts = retry.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await failMessage(msg.id, `send failed after ${attempts} attempts: ${result.reason}`);
        summary.failed++;
      } else {
        const nextRetryAt = startedAt + backoffMs(attempts - 1);
        await db
          .update(emailMessages)
          .set({
            error: encodeRetryState({ attempts, nextRetryAt, message: result.reason }),
          })
          .where(eq(emailMessages.id, msg.id));
        console.log(`[plussent] send-queue: message ${msg.id} failed (attempt ${attempts}/${MAX_ATTEMPTS}), retry at ${new Date(nextRetryAt).toISOString()}: ${result.reason}`);
        summary.failed++;
      }
      continue;
    }

    // Success: mark sent + event row + advance the campaign lead.
    const sentAt = now();
    await db
      .update(emailMessages)
      .set({ status: "sent", sentAt, error: null })
      .where(eq(emailMessages.id, msg.id));
    await db.insert(emailEvents).values({
      id: makeId("evt"),
      workspaceId: msg.workspaceId,
      messageId: msg.id,
      type: "sent",
      metadata: JSON.stringify({ messageId: result.messageId }),
      createdAt: sentAt,
    });
    if (campaign) sentByCampaign.set(campaign.id, (sentByCampaign.get(campaign.id) ?? 0) + 1);
    sentByAccount.set(account.id, (sentByAccount.get(account.id) ?? 0) + 1);
    await db
      .update(emailAccounts)
      .set({
        sentToday: account.sentTodayDate === todayStr ? account.sentToday + 1 : 1,
        sentTodayDate: todayStr,
        updatedAt: sentAt,
      })
      .where(eq(emailAccounts.id, account.id));

    if (cl && campaign) {
      const steps = await db.select().from(sequences).where(eq(sequences.campaignId, campaign.id));
      const nextStepNo = cl.nextStep + 1;
      const nextStep = getStepByNumber(steps, nextStepNo);
      if (!nextStep) {
        await db
          .update(campaignLeads)
          .set({ status: "completed", lastSentAt: sentAt, nextSendAt: null })
          .where(eq(campaignLeads.id, cl.id));
      } else {
        const nextAt = nextSendAt(sentAt, {
          delayDays: nextStep.delayDays,
          delayMinutes: nextStep.delayMinutes,
          businessDaysOnly: nextStep.businessDaysOnly === 1,
          timezone: campaign.timezone,
        }).getTime();
        await db
          .update(campaignLeads)
          .set({ status: "sent", nextStep: nextStepNo, lastSentAt: sentAt, nextSendAt: nextAt })
          .where(eq(campaignLeads.id, cl.id));
      }
    }
    summary.sent++;
    console.log(`[plussent] send-queue: sent message ${msg.id} to ${lead.email}.`);
  }

  console.log(`[plussent] send-queue: done — ${JSON.stringify(summary)}.`);
  return summary;
}

async function failMessage(messageId: string, reason: string): Promise<void> {
  await db
    .update(emailMessages)
    .set({ status: "failed", error: reason })
    .where(eq(emailMessages.id, messageId));
  console.log(`[plussent] send-queue: message ${messageId} failed — ${reason}.`);
}

async function main(): Promise<void> {
  try {
    await processQueue();
  } catch (e) {
    console.error("[plussent] send-queue: fatal error", e);
    process.exitCode = 1;
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith("send-queue.ts")) {
  void main();
}
