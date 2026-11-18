// AI provider interface. NO provider is claimed live without credentials.
// - muse: config surface only (MUSE_API_URL / MUSE_API_KEY). There is NO verified Muse
//   API endpoint in any codebase here, so Muse calls return { status: "awaiting_credentials" }
//   until the user supplies a documented endpoint + key. Do not invent one.
// - openai / anthropic: real HTTP calls when keys are present, else awaiting_credentials.
// - heuristic: local rule-based fallback (spam-word check, reply classification, template
//   subject lines). Always labelled "heuristic" in responses and usage rows.
export type AiProviderId = "muse" | "openai" | "anthropic" | "heuristic";
export interface AiResult { provider: AiProviderId; status: "ok" | "awaiting_credentials" | "error"; text?: string; detail?: string; }
export function providerStatus(): Record<AiProviderId, "configured" | "awaiting_credentials"> {
  return {
    muse: process.env.MUSE_API_KEY && process.env.MUSE_API_URL ? "configured" : "awaiting_credentials",
    openai: process.env.OPENAI_API_KEY ? "configured" : "awaiting_credentials",
    anthropic: process.env.ANTHROPIC_API_KEY ? "configured" : "awaiting_credentials",
    heuristic: "configured",
  };
}
export function preferredProvider(): AiProviderId {
  const s = providerStatus();
  if (s.muse === "configured") return "muse";
  if (s.openai === "configured") return "openai";
  if (s.anthropic === "configured") return "anthropic";
  return "heuristic";
}
// Heuristic reply classification — keyword-assisted, labelled as such. Real LLM
// classification (via a configured provider) supersedes it when available.
const RULES: [RegExp, string][] = [
  [/unsubscribe|remove me|stop emailing/i, "unsubscribe"],
  [/out of office|ooo|on leave|vacation|away until/i, "out_of_office"],
  [/not interested|no thanks|please stop|not a fit/i, "not_interested"],
  [/book (a )?(call|meeting|demo)|schedule|calendar|let'?s meet|available (on|at|next)/i, "meeting_request"],
  [/wrong person|not the right|forward(ed)? to|cc'?ing/i, "wrong_person"],
  [/refer|talk to|contact (my|our) colleague|reach out to/i, "referral"],
  [/interested|love (it|this)|sounds (good|great)|tell me more|send (more|details|pricing)/i, "interested"],
  [/\?/ , "question"],
];
export function classifyReplyHeuristic(body: string): { classification: string; source: "heuristic" } {
  for (const [re, label] of RULES) if (re.test(body)) return { classification: label, source: "heuristic" };
  return { classification: "other", source: "heuristic" };
}
export function spamCheckHeuristic(subject: string, body: string): { score: number; flags: string[] } {
  const text = `${subject} ${body}`.toLowerCase();
  const flags: string[] = [];
  const spamWords = ["free money", "act now", "click here", "guaranteed", "make money fast", "limited time", "!!!", "100% free"];
  for (const w of spamWords) if (text.includes(w)) flags.push(`spam phrase: "${w}"`);
  if (/[A-Z]{8,}/.test(subject)) flags.push("ALL-CAPS subject");
  if ((subject.match(/!/g) || []).length >= 2) flags.push("multiple exclamation marks");
  const score = Math.max(0, 100 - flags.length * 15);
  return { score, flags };
}
export async function generateWithProvider(provider: AiProviderId, prompt: string): Promise<AiResult> {
  const status = providerStatus();
  if (provider === "muse") {
    // No verified Muse endpoint exists. Return awaiting-credentials honestly.
    return { provider, status: "awaiting_credentials", detail: "MUSE_API_URL and MUSE_API_KEY are not configured, and no verified Muse endpoint is documented. Supply them in Settings → AI Providers." };
  }
  if (provider === "heuristic") return { provider, status: "ok", text: `[heuristic draft] ${prompt.slice(0, 200)}` };
  if (status[provider] !== "configured") return { provider, status: "awaiting_credentials", detail: `${provider} API key is not configured.` };
  try {
    if (provider === "openai") {
      const r = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "user", content: prompt }] }) });
      const j = await r.json() as { choices?: { message?: { content?: string } }[] };
      return { provider, status: r.ok ? "ok" : "error", text: j.choices?.[0]?.message?.content, detail: r.ok ? undefined : JSON.stringify(j).slice(0, 300) };
    }
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 1024, messages: [{ role: "user", content: prompt }] }) });
    const j = await r.json() as { content?: { text?: string }[] };
    return { provider, status: r.ok ? "ok" : "error", text: j.content?.map((c) => c.text).join(""), detail: r.ok ? undefined : JSON.stringify(j).slice(0, 300) };
  } catch (e) { return { provider, status: "error", detail: String(e).slice(0, 300) }; }
}
