// GET /api/inbox — workspace-scoped conversations with lead info attached.
import { and, count, desc, eq, inArray, like, or } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getWorkspaceAuth, parsePagination } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { conversations, leads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { page, limit, offset } = parsePagination(req.nextUrl);
  const status = req.nextUrl.searchParams.get("status")?.trim() ?? "";
  const search = req.nextUrl.searchParams.get("search")?.trim() ?? "";
  const classification = req.nextUrl.searchParams.get("classification")?.trim() ?? "";

  const conditions = [eq(conversations.workspaceId, auth.workspaceId)];
  if (status) conditions.push(eq(conversations.status, status));
  if (classification) conditions.push(eq(conversations.classification, classification));
  if (search) {
    const q = `%${search}%`;
    conditions.push(or(like(conversations.subject, q), like(conversations.classification, q))!);
  }
  const where = and(...conditions);
  const [totalRows] = await db.select({ n: count() }).from(conversations).where(where);
  const rows = await db
    .select()
    .from(conversations)
    .where(where)
    .orderBy(desc(conversations.updatedAt))
    .limit(limit)
    .offset(offset);

  const leadIds = [...new Set(rows.map((r) => r.leadId).filter((x): x is string => !!x))];
  const leadRows = leadIds.length
    ? await db.select().from(leads).where(inArray(leads.id, leadIds))
    : [];
  const leadById = new Map(
    leadRows.map((l) => [
      l.id,
      {
        id: l.id,
        email: l.email,
        name: `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim() || null,
        company: l.company,
      },
    ]),
  );
  return NextResponse.json({
    ok: true,
    conversations: rows.map((r) => ({ ...r, lead: r.leadId ? leadById.get(r.leadId) ?? null : null })),
    total: totalRows?.n ?? 0,
    page,
    limit,
  });
}
