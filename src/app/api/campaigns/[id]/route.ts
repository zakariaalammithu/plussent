// PATCH /api/campaigns/[id] — update fields / change status (pause/resume/stop/archive).
//   Setting status to "active" enqueues step 1 for every pending lead.
// DELETE /api/campaigns/[id] — delete the campaign, its steps and its lead assignments
//   (sent messages/events are kept for audit).
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, now } from "@/lib/db";
import { campaignLeads, campaigns, sequences } from "@/lib/db/schema";
import { enqueueStepForLead } from "@/lib/enqueue";

export const dynamic = "force-dynamic";

const CAMPAIGN_STATUSES = ["draft", "active", "paused", "stopped", "archived"] as const;

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    status: z.enum(CAMPAIGN_STATUSES).optional(),
    timezone: z.string().trim().max(50).optional(),
    dailyLimit: z.number().int().min(1).max(10000).optional(),
    trackingOpen: z.boolean().optional(),
    trackingClick: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

async function findCampaign(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findCampaign(auth.workspaceId, id);
  if (!row) return notFound("campaign_not_found");
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const patch: Record<string, unknown> = { updatedAt: now() };
  if (v.name !== undefined) patch.name = v.name;
  if (v.status !== undefined) patch.status = v.status;
  if (v.timezone !== undefined) patch.timezone = v.timezone;
  if (v.dailyLimit !== undefined) patch.dailyLimit = v.dailyLimit;
  if (v.trackingOpen !== undefined) patch.trackingOpen = v.trackingOpen ? 1 : 0;
  if (v.trackingClick !== undefined) patch.trackingClick = v.trackingClick ? 1 : 0;
  await db.update(campaigns).set(patch).where(eq(campaigns.id, id));

  let enqueued = 0;
  let enqueueSkipped: { campaignLeadId: string; reason: string }[] = [];
  if (v.status === "active") {
    // Queue step 1 for every pending lead in this campaign.
    const pending = await db
      .select()
      .from(campaignLeads)
      .where(and(eq(campaignLeads.campaignId, id), eq(campaignLeads.status, "pending")));
    for (const cl of pending) {
      const r = await enqueueStepForLead({ workspaceId: auth.workspaceId, campaignId: id, campaignLeadId: cl.id });
      if (r.queued) enqueued++;
      else enqueueSkipped.push({ campaignLeadId: cl.id, reason: r.reason ?? "unknown" });
    }
  }
  const updated = await findCampaign(auth.workspaceId, id);
  return NextResponse.json({ ok: true, campaign: updated, enqueued, enqueueSkipped });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findCampaign(auth.workspaceId, id);
  if (!row) return notFound("campaign_not_found");
  await db.delete(sequences).where(eq(sequences.campaignId, id));
  await db.delete(campaignLeads).where(eq(campaignLeads.campaignId, id));
  await db.delete(campaigns).where(eq(campaigns.id, id));
  return NextResponse.json({ ok: true, deleted: true, id });
}
