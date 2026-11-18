// GET /api/leads — workspace-scoped list with pagination + search.
// POST /api/leads — create one lead (validated, deduped by workspace+email).
import { and, count, desc, eq, like, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, parsePagination, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { leads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const leadSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(50).optional(),
  company: z.string().trim().max(200).optional(),
  website: z.string().trim().max(500).optional(),
  jobTitle: z.string().trim().max(200).optional(),
  industry: z.string().trim().max(200).optional(),
  country: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  linkedinUrl: z.string().trim().max(500).optional(),
  tags: z.array(z.string().trim()).max(50).optional(),
  customFields: z.record(z.string(), z.string()).optional(),
  verificationStatus: z
    .enum(["unverified", "valid", "invalid", "risky", "disposable"])
    .optional(),
  listId: z.string().max(100).optional(),
});

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

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { page, limit, offset } = parsePagination(req.nextUrl);
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const listId = req.nextUrl.searchParams.get("listId")?.trim() ?? "";
  const verificationStatus = req.nextUrl.searchParams.get("verificationStatus")?.trim() ?? "";

  const conditions = [eq(leads.workspaceId, auth.workspaceId)];
  if (search) {
    const q = `%${search}%`;
    conditions.push(
      or(
        like(leads.email, q),
        like(leads.firstName, q),
        like(leads.lastName, q),
        like(leads.company, q),
      )!,
    );
  }
  if (listId) conditions.push(eq(leads.listId, listId));
  if (verificationStatus) conditions.push(eq(leads.verificationStatus, verificationStatus));
  const where = and(...conditions);

  const [totalRows] = await db.select({ n: count() }).from(leads).where(where);
  const rows = await db
    .select()
    .from(leads)
    .where(where)
    .orderBy(desc(leads.createdAt))
    .limit(limit)
    .offset(offset);
  return NextResponse.json({
    ok: true,
    leads: rows.map(serializeLead),
    total: totalRows?.n ?? 0,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = leadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.workspaceId, auth.workspaceId), eq(leads.email, v.email)))
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "duplicate", message: `A lead with email ${v.email} already exists in this workspace.` },
      { status: 409 },
    );
  }
  const id = makeId("lead");
  await db.insert(leads).values({
    id,
    workspaceId: auth.workspaceId,
    firstName: v.firstName ?? null,
    lastName: v.lastName ?? null,
    email: v.email,
    phone: v.phone ?? null,
    company: v.company ?? null,
    website: v.website ?? null,
    jobTitle: v.jobTitle ?? null,
    industry: v.industry ?? null,
    country: v.country ?? null,
    city: v.city ?? null,
    linkedinUrl: v.linkedinUrl ?? null,
    tags: JSON.stringify(v.tags ?? []),
    customFields: JSON.stringify(v.customFields ?? {}),
    verificationStatus: v.verificationStatus ?? "unverified",
    listId: v.listId ?? null,
    createdAt: now(),
    updatedAt: now(),
  });
  const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
  if (!row) return notFound("lead_not_found_after_create");
  return NextResponse.json({ ok: true, lead: serializeLead(row) }, { status: 201 });
}
