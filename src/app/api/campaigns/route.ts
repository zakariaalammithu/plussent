// GET /api/campaigns — workspace-scoped list. POST — create a campaign (draft).
import { and, count, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, parsePagination, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { campaigns } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
  timezone: z.string().trim().max(50).optional(),
  dailyLimit: z.number().int().min(1).max(10000).optional(),
  trackingOpen: z.boolean().optional(),
  trackingClick: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { page, limit, offset } = parsePagination(req.nextUrl);
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const conditions = [eq(campaigns.workspaceId, auth.workspaceId)];
  if (status) conditions.push(eq(campaigns.status, status));
  const where = and(...conditions);
  const [totalRows] = await db.select({ n: count() }).from(campaigns).where(where);
  const rows = await db
    .select()
    .from(campaigns)
    .where(where)
    .orderBy(desc(campaigns.createdAt))
    .limit(limit)
    .offset(offset);
  return NextResponse.json({
    ok: true,
    campaigns: rows,
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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const id = makeId("camp");
  await db.insert(campaigns).values({
    id,
    workspaceId: auth.workspaceId,
    name: v.name,
    status: "draft",
    timezone: v.timezone ?? "UTC",
    dailyLimit: v.dailyLimit ?? 50,
    trackingOpen: v.trackingOpen ? 1 : 0,
    trackingClick: v.trackingClick === false ? 0 : 1,
    createdAt: now(),
    updatedAt: now(),
  });
  const [row] = await db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
  return NextResponse.json({ ok: true, campaign: row }, { status: 201 });
}
