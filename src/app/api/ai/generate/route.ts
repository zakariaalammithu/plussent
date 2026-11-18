import { NextRequest, NextResponse } from "next/server";
import { count, and, eq, gte } from "drizzle-orm";
import { db, makeId, now } from "@/lib/db";
import { aiUsage } from "@/lib/db/schema";
import { generateWithProvider, preferredProvider, providerStatus } from "@/lib/ai/providers";
import { getWorkspaceAuth } from "@/lib/api-auth";

const DAILY_CAP = 100;
const KINDS = ["email_write", "personalization", "reply_classify", "assistant"] as const;

function startOfTodayUtc(): number {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const workspaceId = auth.workspaceId;
  const userId = auth.userId;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const b = body as { kind?: string; prompt?: string };
  const kind = KINDS.includes(b.kind as (typeof KINDS)[number]) ? (b.kind as (typeof KINDS)[number]) : "assistant";
  const prompt = typeof b.prompt === "string" ? b.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  if (prompt.length > 8000) return NextResponse.json({ error: "prompt too long (max 8000 chars)" }, { status: 400 });

  try {
    const used = await db
      .select({ n: count() })
      .from(aiUsage)
      .where(and(eq(aiUsage.workspaceId, workspaceId), gte(aiUsage.createdAt, startOfTodayUtc())));
    const usageToday = used[0]?.n ?? 0;
    if (usageToday >= DAILY_CAP) {
      return NextResponse.json({ error: "daily AI cap reached (100 calls per workspace per day)", usageToday, cap: DAILY_CAP }, { status: 429 });
    }
    const provider = preferredProvider();
    const result = await generateWithProvider(provider, prompt);
    await db.insert(aiUsage).values({
      id: makeId("aiu"), workspaceId, userId,
      provider: result.provider, kind, units: 1, createdAt: now(),
    });
    return NextResponse.json({
      provider: result.provider, status: result.status, text: result.text ?? null,
      detail: result.detail ?? null, usageToday: usageToday + 1, cap: DAILY_CAP,
      providerStatus: providerStatus(),
    });
  } catch (e) {
    return NextResponse.json({ error: "AI request failed — database may not be initialised", detail: String(e).slice(0, 200) }, { status: 500 });
  }
}
