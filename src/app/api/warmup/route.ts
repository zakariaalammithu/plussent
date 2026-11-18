// GET /api/warmup — list warmup sessions (with account email attached).
// POST — create a session { emailAccountId, dailyVolume?, status? } or
// pause/resume an existing one { id, action: "pause" | "resume" }.
import { and, desc, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, parsePagination, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { emailAccounts, warmupSessions } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  emailAccountId: z.string().min(1),
  dailyVolume: z.number().int().min(1).max(500).optional(),
  status: z.enum(["active", "paused"]).optional(),
});

const actionSchema = z.object({
  id: z.string().min(1),
  action: z.enum(["pause", "resume"]),
});

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { page, limit, offset } = parsePagination(req.nextUrl);
  const rows = await db
    .select()
    .from(warmupSessions)
    .where(eq(warmupSessions.workspaceId, auth.workspaceId))
    .orderBy(desc(warmupSessions.createdAt))
    .limit(limit)
    .offset(offset);
  const accountIds = [...new Set(rows.map((r) => r.emailAccountId))];
  const accounts = accountIds.length
    ? await db.select().from(emailAccounts).where(inArray(emailAccounts.id, accountIds))
    : [];
  const byId = new Map(accounts.map((a) => [a.id, a.email]));
  return NextResponse.json({
    ok: true,
    sessions: rows.map((r) => ({ ...r, accountEmail: byId.get(r.emailAccountId) ?? null })),
    total: rows.length,
    page,
    limit,
  });
}

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;

  // Pause / resume an existing session.
  const action = actionSchema.safeParse(body);
  if (action.success) {
    const [row] = await db
      .select()
      .from(warmupSessions)
      .where(
        and(eq(warmupSessions.id, action.data.id), eq(warmupSessions.workspaceId, auth.workspaceId)),
      )
      .limit(1);
    if (!row) return notFound("warmup_session_not_found");
    const status = action.data.action === "pause" ? "paused" : "active";
    await db.update(warmupSessions).set({ status, updatedAt: now() }).where(eq(warmupSessions.id, row.id));
    const [updated] = await db.select().from(warmupSessions).where(eq(warmupSessions.id, row.id)).limit(1);
    return NextResponse.json({ ok: true, session: updated });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const [account] = await db
    .select({ id: emailAccounts.id })
    .from(emailAccounts)
    .where(
      and(
        eq(emailAccounts.id, parsed.data.emailAccountId),
        eq(emailAccounts.workspaceId, auth.workspaceId),
      ),
    )
    .limit(1);
  if (!account) return notFound("email_account_not_found");
  const [existing] = await db
    .select()
    .from(warmupSessions)
    .where(
      and(
        eq(warmupSessions.emailAccountId, parsed.data.emailAccountId),
        eq(warmupSessions.workspaceId, auth.workspaceId),
      ),
    )
    .limit(1);
  if (existing) {
    return NextResponse.json(
      { error: "duplicate", message: "A warmup session already exists for this account." },
      { status: 409 },
    );
  }
  const id = makeId("warm");
  await db.insert(warmupSessions).values({
    id,
    workspaceId: auth.workspaceId,
    emailAccountId: parsed.data.emailAccountId,
    status: parsed.data.status ?? "active",
    dailyVolume: parsed.data.dailyVolume ?? 10,
    createdAt: now(),
    updatedAt: now(),
  });
  const [row] = await db.select().from(warmupSessions).where(eq(warmupSessions.id, id)).limit(1);
  return NextResponse.json({ ok: true, session: row }, { status: 201 });
}
