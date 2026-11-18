import { NextRequest, NextResponse } from "next/server";
import { classifyReplyHeuristic, generateWithProvider, preferredProvider, providerStatus, spamCheckHeuristic } from "@/lib/ai/providers";
import { requireAuth } from "@/lib/auth";

const LABELS = ["interested", "positive", "meeting_request", "question", "not_interested", "unsubscribe", "out_of_office", "wrong_person", "referral", "negative", "other"] as const;

/** POST { body | text } -> reply classification + spam check.
 *  Always returns the heuristic result; when a real LLM provider is configured
 *  it is asked too and its label is reported separately (never silently swapped). */
export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON body" }, { status: 400 }); }
  const b = body as { body?: string; text?: string; subject?: string };
  const text = typeof b.body === "string" ? b.body : typeof b.text === "string" ? b.text : "";
  if (!text.trim()) return NextResponse.json({ error: "body is required" }, { status: 400 });
  const subject = typeof b.subject === "string" ? b.subject : "";

  const heuristic = classifyReplyHeuristic(text);
  const spam = spamCheckHeuristic(subject, text);
  const status = providerStatus();
  const provider = preferredProvider();

  let llm: { provider: string; classification: string | null; status: string; detail?: string } | null = null;
  if (provider !== "heuristic") {
    const prompt = `Classify this email reply into exactly one label: ${LABELS.join(", ")}. Reply with only the label.\n\n${text.slice(0, 2000)}`;
    const r = await generateWithProvider(provider, prompt);
    const found = LABELS.find((l) => (r.text ?? "").toLowerCase().includes(l));
    llm = { provider: r.provider, classification: found ?? null, status: r.status, detail: r.detail };
  }

  return NextResponse.json({
    classification: llm?.classification ?? heuristic.classification,
    classificationSource: llm?.classification ? llm.provider : "heuristic",
    heuristic,
    llm,
    spam,
    providerStatus: status,
  });
}
