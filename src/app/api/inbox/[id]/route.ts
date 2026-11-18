// PATCH /api/inbox/[id] — change a conversation's status / assignee.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { db, now } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    status: z.enum(["open", "starred", "archived", "assigned"]).optional(),
    assignedTo: z.string().trim().max(200).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no fields to update" });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { id } = await params;
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.workspaceId, auth.workspaceId)))
    .limit(1);
  if (!row) return notFound("conversation_not_found");
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
  if (v.status !== undefined) patch.status = v.status;
  if (v.assignedTo !== undefined) {
    patch.assignedTo = v.assignedTo;
    if (v.status === undefined && v.assignedTo) patch.status = "assigned";
  }
  await db.update(conversations).set(patch).where(eq(conversations.id, id));
  const [updated] = await db.select().from(conversations).where(eq(conversations.id, id)).limit(1);
  return NextResponse.json({ ok: true, conversation: updated });
}
