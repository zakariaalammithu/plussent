// PATCH /api/leads/[id] — update a lead. DELETE /api/leads/[id] — remove it.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, now } from "@/lib/db";
import { campaignLeads, leads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function serializeLead(row: typeof leads.$inferSelect) {
  let tags: unknown = [];
  let customFields: unknown = {};
  try {
    tags = JSON.parse(row.tags ?? "[]");
  } catch {
    tags = [];
  }
  try {
    customFields = JSON.parse(row.customFields ?? "{}");
  } catch {
    customFields = {};
  }
  return { ...row, tags, customFields };
}

const patchSchema = z
  .object({
    firstName: z.string().trim().max(100).nullable().optional(),
    lastName: z.string().trim().max(100).nullable().optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    phone: z.string().trim().max(50).nullable().optional(),
    company: z.string().trim().max(200).nullable().optional(),
    website: z.string().trim().max(500).nullable().optional(),
    jobTitle: z.string().trim().max(200).nullable().optional(),
    industry: z.string().trim().max(200).nullable().optional(),
    country: z.string().trim().max(100).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    linkedinUrl: z.string().trim().max(500).nullable().optional(),
    tags: z.array(z.string().trim()).max(50).optional(),
    customFields: z.record(z.string(), z.string()).optional(),
    verificationStatus: z
      .enum(["unverified", "valid", "invalid", "risky", "disposable"])
      .optional(),
    listId: z.string().max(100).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

async function findLead(workspaceId: string, id: string) {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.workspaceId, workspaceId)))
    .limit(1);
  return row ?? null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findLead(auth.workspaceId, id);
  if (!row) return notFound("lead_not_found");
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
  if (v.email && v.email !== row.email) {
    const [dup] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.workspaceId, auth.workspaceId), eq(leads.email, v.email)))
      .limit(1);
    if (dup) {
      return NextResponse.json(
        { error: "duplicate", message: `A lead with email ${v.email} already exists in this workspace.` },
        { status: 409 },
      );
    }
  }
  const patch: Record<string, unknown> = { updatedAt: now() };
  for (const [k, val] of Object.entries(v)) {
    if (k === "tags") patch.tags = JSON.stringify(val);
    else if (k === "customFields") patch.customFields = JSON.stringify(val);
    else patch[k] = val;
  }
  await db.update(leads).set(patch).where(eq(leads.id, id));
  const updated = await findLead(auth.workspaceId, id);
  return NextResponse.json({ ok: true, lead: updated ? serializeLead(updated) : null });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(_req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const row = await findLead(auth.workspaceId, id);
  if (!row) return notFound("lead_not_found");
  await db.delete(campaignLeads).where(eq(campaignLeads.leadId, id));
  await db.delete(leads).where(eq(leads.id, id));
  return NextResponse.json({ ok: true, deleted: true, id });
}
