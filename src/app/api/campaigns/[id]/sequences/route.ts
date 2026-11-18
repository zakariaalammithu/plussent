// GET /api/campaigns/[id]/sequences — list steps (ascending).
// POST — add a step (step number auto-assigned as max+1 unless given).
import { and, asc, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, makeId } from "@/lib/db";
import { campaigns, sequences } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const stepSchema = z.object({
  subject: z.string().trim().min(1, "subject is required").max(500),
  body: z.string().min(1, "body is required").max(100000),
  delayDays: z.number().int().min(0).max(365).optional(),
  delayMinutes: z.number().int().min(0).max(1439).optional(),
  businessDaysOnly: z.boolean().optional(),
  variant: z.string().trim().max(10).optional(),
  step: z.number().int().min(1).max(100).optional(),
});

async function findCampaign(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const campaign = await findCampaign(auth.workspaceId, id);
  if (!campaign) return notFound("campaign_not_found");
  const steps = await db
    .select()
    .from(sequences)
    .where(eq(sequences.campaignId, id))
    .orderBy(asc(sequences.step));
  return NextResponse.json({ ok: true, steps });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const campaign = await findCampaign(auth.workspaceId, id);
  if (!campaign) return notFound("campaign_not_found");
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = stepSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  let stepNo = v.step;
  if (stepNo === undefined) {
    const [top] = await db
      .select()
      .from(sequences)
      .where(eq(sequences.campaignId, id))
      .orderBy(desc(sequences.step))
      .limit(1);
    stepNo = (top?.step ?? 0) + 1;
  } else {
    const [clash] = await db
      .select({ id: sequences.id })
      .from(sequences)
      .where(and(eq(sequences.campaignId, id), eq(sequences.step, stepNo)))
      .limit(1);
    if (clash) {
      return NextResponse.json(
        { error: "duplicate_step", message: `Step ${stepNo} already exists in this campaign.` },
        { status: 409 },
      );
    }
  }
  const sid = makeId("seq");
  await db.insert(sequences).values({
    id: sid,
    campaignId: id,
    step: stepNo,
    subject: v.subject,
    body: v.body,
    delayDays: v.delayDays ?? 0,
    delayMinutes: v.delayMinutes ?? 0,
    businessDaysOnly: v.businessDaysOnly === false ? 0 : 1,
    variant: v.variant ?? "A",
  });
  const [row] = await db.select().from(sequences).where(eq(sequences.id, sid)).limit(1);
  return NextResponse.json({ ok: true, step: row }, { status: 201 });
}
