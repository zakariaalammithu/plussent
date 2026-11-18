// POST /api/campaigns/[id]/leads — assign leads to a campaign.
// Dedupes (already-in-campaign leads are reported, not re-added) and checks
// the suppression list (suppressed emails are reported as skipped, never queued).
// Leads assigned to an already-active campaign are queued for step 1 immediately.
import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { campaignLeads, campaigns, leads, suppressions } from "@/lib/db/schema";
import { enqueueStepForLead } from "@/lib/enqueue";

export const dynamic = "force-dynamic";

const assignSchema = z.object({
  leadIds: z.array(z.string().min(1)).min(1, "leadIds is required").max(5000),
  emailAccountId: z.string().max(100).optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!campaign) return notFound("campaign_not_found");
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = assignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { leadIds, emailAccountId } = parsed.data;

  const leadRows = await db
    .select()
    .from(leads)
    .where(and(eq(leads.workspaceId, auth.workspaceId), inArray(leads.id, leadIds)));
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  const suppressedRows = await db
    .select()
    .from(suppressions)
    .where(eq(suppressions.workspaceId, auth.workspaceId));
  const suppressed = new Map(suppressedRows.map((s) => [s.email.toLowerCase(), s.reason]));

  const existingRows = await db
    .select()
    .from(campaignLeads)
    .where(and(eq(campaignLeads.campaignId, id), inArray(campaignLeads.leadId, leadIds)));
  const alreadyIn = new Set(existingRows.map((r) => r.leadId));

  const added: string[] = [];
  const skipped: { leadId: string; reason: string }[] = [];
  for (const leadId of leadIds) {
    const lead = leadById.get(leadId);
    if (!lead) {
      skipped.push({ leadId, reason: "lead_not_found_in_workspace" });
      continue;
    }
    if (alreadyIn.has(leadId)) {
      skipped.push({ leadId, reason: "already_in_campaign" });
      continue;
    }
    const reason = suppressed.get(lead.email.toLowerCase());
    if (reason) {
      skipped.push({ leadId, reason: `suppressed: ${reason}` });
      continue;
    }
    const clId = makeId("cl");
    try {
      await db.insert(campaignLeads).values({
        id: clId,
        campaignId: id,
        leadId,
        emailAccountId: emailAccountId ?? null,
        status: "pending",
        nextStep: 1,
        nextSendAt: null,
        lastSentAt: null,
        createdAt: now(),
      });
    } catch {
      // Race / duplicate inside this same request — report, never crash.
      skipped.push({ leadId, reason: "already_in_campaign" });
      continue;
    }
    alreadyIn.add(leadId);
    added.push(clId);
    if (campaign.status === "active") {
      await enqueueStepForLead({ workspaceId: auth.workspaceId, campaignId: id, campaignLeadId: clId });
    }
  }
  return NextResponse.json({ ok: true, added: added.length, addedIds: added, skipped });
}
