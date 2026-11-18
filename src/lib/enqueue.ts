// PlaseSent — queue one sequence step as a queued emailMessage (Module B).
// Shared by the campaign routes (activate / assign leads) and scripts/send-queue.ts.
// A message is only ever created as status "queued" — sending happens in the
// worker, never here, and never without a real SMTP send.
import { and, asc, eq } from "drizzle-orm";
import { getFirstStep, getStepByNumber, nextSendAt, renderTemplate } from "./campaigns";
import { db, makeId, now } from "./db";
import { campaignLeads, campaigns, emailMessages, leads, sequences } from "./db/schema";

export interface EnqueueResult {
  queued: boolean;
  reason?: string;
  messageId?: string;
  sendAt?: number;
}

export async function enqueueStepForLead(input: {
  workspaceId: string;
  campaignId: string;
  campaignLeadId: string;
}): Promise<EnqueueResult> {
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, input.campaignId), eq(campaigns.workspaceId, input.workspaceId)))
    .limit(1);
  if (!campaign) return { queued: false, reason: "campaign_not_found" };
  if (campaign.status !== "active") return { queued: false, reason: `campaign_${campaign.status}` };

  const [cl] = await db
    .select()
    .from(campaignLeads)
    .where(eq(campaignLeads.id, input.campaignLeadId))
    .limit(1);
  if (!cl) return { queued: false, reason: "campaign_lead_not_found" };
  if (["replied", "bounced", "unsubscribed", "stopped", "completed"].includes(cl.status)) {
    return { queued: false, reason: `lead_${cl.status}` };
  }
  if (cl.status === "queued") return { queued: false, reason: "already_queued" };

  const [lead] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, cl.leadId), eq(leads.workspaceId, input.workspaceId)))
    .limit(1);
  if (!lead) return { queued: false, reason: "lead_not_found" };

  const steps = await db
    .select()
    .from(sequences)
    .where(eq(sequences.campaignId, campaign.id))
    .orderBy(asc(sequences.step));
  const step = getStepByNumber(steps, cl.nextStep) ?? getFirstStep(steps);
  if (!step) return { queued: false, reason: "no_sequence_steps" };

  const idempotencyKey = `cl_${cl.id}_step_${step.step}`;
  const [existing] = await db
    .select({ id: emailMessages.id })
    .from(emailMessages)
    .where(eq(emailMessages.idempotencyKey, idempotencyKey))
    .limit(1);
  if (existing) return { queued: false, reason: "already_queued" };

  const leadLike = {
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    company: lead.company,
    jobTitle: lead.jobTitle,
    phone: lead.phone,
    website: lead.website,
    city: lead.city,
    country: lead.country,
    industry: lead.industry,
    linkedinUrl: lead.linkedinUrl,
    customFields: safeJson(lead.customFields),
  };
  const base = cl.lastSentAt ?? cl.createdAt ?? now();
  const sendAt = nextSendAt(base, {
    delayDays: step.delayDays,
    delayMinutes: step.delayMinutes,
    businessDaysOnly: step.businessDaysOnly === 1,
    timezone: campaign.timezone,
  }).getTime();

  const messageId = makeId("msg");
  await db.insert(emailMessages).values({
    id: messageId,
    workspaceId: input.workspaceId,
    campaignId: campaign.id,
    campaignLeadId: cl.id,
    leadId: lead.id,
    emailAccountId: cl.emailAccountId,
    subject: renderTemplate(step.subject, leadLike),
    body: renderTemplate(step.body, leadLike),
    status: "queued",
    idempotencyKey,
    error: null,
    sentAt: null,
    openedAt: null,
    clickedAt: null,
    createdAt: now(),
  });
  await db
    .update(campaignLeads)
    .set({ status: "queued", nextSendAt: sendAt })
    .where(eq(campaignLeads.id, cl.id));
  return { queued: true, messageId, sendAt };
}

function safeJson(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === "object" ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}
