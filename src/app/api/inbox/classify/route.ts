// POST /api/inbox/classify — classify reply text with the heuristic
// classifier from src/lib/ai/providers.ts. Always labelled "heuristic":
// this is a keyword-based fallback, not an LLM judgement. Optionally pass
// conversationId to store the classification on that conversation.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, notFound, readJson } from "@/lib/api-auth";
import { classifyReplyHeuristic } from "@/lib/ai/providers";
import { db, now } from "@/lib/db";
import { conversations } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const classifySchema = z.object({
  text: z.string().trim().min(1, "text is required").max(100000).optional(),
  body: z.string().trim().min(1).max(100000).optional(),
  conversationId: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: payload, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = classifySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const text = parsed.data.text ?? parsed.data.body ?? "";
  if (!text) {
    return NextResponse.json(
      { error: "validation_failed", message: "Provide text (or body) to classify." },
      { status: 400 },
    );
  }
  const { classification, source } = classifyReplyHeuristic(text);
  let stored = false;
  if (parsed.data.conversationId) {
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, parsed.data.conversationId),
          eq(conversations.workspaceId, auth.workspaceId),
        ),
      )
      .limit(1);
    if (!conv) return notFound("conversation_not_found");
    await db
      .update(conversations)
      .set({ classification, classificationSource: "heuristic", updatedAt: now() })
      .where(eq(conversations.id, conv.id));
    stored = true;
  }
  return NextResponse.json({
    ok: true,
    classification,
    source, // "heuristic"
    provider: "heuristic",
    stored,
  });
}
