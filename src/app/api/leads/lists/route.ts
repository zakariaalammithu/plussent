// GET /api/leads/lists — list lead lists. POST — create a lead list.
import { count, desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, parsePagination, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { leadLists } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(200),
});

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { page, limit, offset } = parsePagination(req.nextUrl);
  const [totalRows] = await db
    .select({ n: count() })
    .from(leadLists)
    .where(eq(leadLists.workspaceId, auth.workspaceId));
  const rows = await db
    .select()
    .from(leadLists)
    .where(eq(leadLists.workspaceId, auth.workspaceId))
    .orderBy(desc(leadLists.createdAt))
    .limit(limit)
    .offset(offset);
  return NextResponse.json({
    ok: true,
    lists: rows,
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
  const id = makeId("list");
  await db.insert(leadLists).values({
    id,
    workspaceId: auth.workspaceId,
    name: parsed.data.name,
    createdAt: now(),
  });
  const [row] = await db.select().from(leadLists).where(eq(leadLists.id, id)).limit(1);
  return NextResponse.json({ ok: true, list: row }, { status: 201 });
}
