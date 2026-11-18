// PlusSent — campaign pure logic (Module B).
// No imports, no I/O: safe to unit-test with plain node --test.
export interface LeadLike {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  industry?: string | null;
  linkedinUrl?: string | null;
  customFields?: Record<string, string> | null;
}

// ---------------------------------------------------------------- templates
const TOKEN_ALIASES: Record<string, (lead: LeadLike) => string> = {
  first_name: (l) => l.firstName ?? "",
  firstname: (l) => l.firstName ?? "",
  first: (l) => l.firstName ?? "",
  last_name: (l) => l.lastName ?? "",
  lastname: (l) => l.lastName ?? "",
  last: (l) => l.lastName ?? "",
  full_name: (l) => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
  fullname: (l) => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
  name: (l) => `${l.firstName ?? ""} ${l.lastName ?? ""}`.trim(),
  email: (l) => l.email ?? "",
  company: (l) => l.company ?? "",
  company_name: (l) => l.company ?? "",
  job_title: (l) => l.jobTitle ?? "",
  jobtitle: (l) => l.jobTitle ?? "",
  title: (l) => l.jobTitle ?? "",
  phone: (l) => l.phone ?? "",
  website: (l) => l.website ?? "",
  city: (l) => l.city ?? "",
  country: (l) => l.country ?? "",
  industry: (l) => l.industry ?? "",
  linkedin_url: (l) => l.linkedinUrl ?? "",
  linkedinurl: (l) => l.linkedinUrl ?? "",
};

/**
 * Replace {{token}} placeholders with lead values. Known tokens with no value
 * become "". Unknown tokens (incl. {{custom.foo}} with no such field) are left
 * untouched so a typo is visible instead of silently vanishing.
 */
export function renderTemplate(body: string, lead: LeadLike): string {
  return body.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (whole, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const fn = TOKEN_ALIASES[key];
    if (fn) return fn(lead);
    if (key.startsWith("custom.")) {
      const field = rawKey.slice("custom.".length);
      const val = lead.customFields?.[field];
      return val !== undefined && val !== null ? String(val) : whole;
    }
    return whole;
  });
}

// ---------------------------------------------------------------- scheduling
/** Parse a UTC offset string ("+05:30", "-04:00", "+0530", "UTC+5", "Z", "UTC") to minutes. Unparseable -> 0. */
export function parseUtcOffset(timezone?: string | null): number {
  if (!timezone) return 0;
  const t = timezone.trim();
  if (t === "" || t.toUpperCase() === "UTC" || t.toUpperCase() === "GMT" || t.toUpperCase() === "Z") return 0;
  const m = t.match(/^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const minutes = Number(m[3] ?? "0");
  if (hours > 14 || minutes > 59) return 0;
  return sign * (hours * 60 + minutes);
}

function isWeekendLocal(localMs: number): boolean {
  const d = new Date(localMs).getUTCDay();
  return d === 0 || d === 6;
}

export interface NextSendAtOpts {
  delayDays?: number;
  delayMinutes?: number;
  /** When true, delayDays counts business days and the result never lands on Sat/Sun. */
  businessDaysOnly?: boolean;
  /** UTC offset string, e.g. "+05:30". Defaults to UTC. */
  timezone?: string | null;
}

/**
 * Compute the next send time. `from` is a Date or epoch ms (UTC).
 * With businessDaysOnly, delayDays counts business days only and a result
 * landing on a weekend rolls forward to Monday (same local time-of-day).
 */
export function nextSendAt(from: Date | number, opts: NextSendAtOpts = {}): Date {
  const delayDays = Math.max(0, Math.floor(opts.delayDays ?? 0));
  const delayMinutes = Math.max(0, Math.floor(opts.delayMinutes ?? 0));
  const business = opts.businessDaysOnly ?? false;
  const offsetMs = parseUtcOffset(opts.timezone) * 60_000;
  const startUtc = from instanceof Date ? from.getTime() : from;
  let local = startUtc + offsetMs;
  let remaining = delayDays;
  while (remaining > 0) {
    local += 86_400_000;
    if (!business || !isWeekendLocal(local)) remaining--;
  }
  local += delayMinutes * 60_000;
  if (business) {
    while (isWeekendLocal(local)) local += 86_400_000;
  }
  return new Date(local - offsetMs);
}

// ---------------------------------------------------------------- stop rules
/** Event types that stop all further sequence steps for a lead. */
export const STOP_EVENT_TYPES = [
  "reply",
  "replied",
  "bounce",
  "bounced",
  "unsubscribe",
  "unsubscribed",
  "meeting",
  "meeting_request",
  "complaint",
  "complained",
] as const;

/** Campaign-lead statuses after which no further email may be sent. */
export const TERMINAL_LEAD_STATUSES = [
  "replied",
  "bounced",
  "unsubscribed",
  "stopped",
  "completed",
] as const;

export type CampaignLeadLike = { status?: string | null };

/** True when this event (or the lead's current status) means: stop sequencing. */
export function shouldStop(
  campaignLead: CampaignLeadLike | null | undefined,
  eventType: string,
): boolean {
  const ev = (eventType ?? "").trim().toLowerCase();
  if ((STOP_EVENT_TYPES as readonly string[]).includes(ev)) return true;
  const st = (campaignLead?.status ?? "").trim().toLowerCase();
  if ((TERMINAL_LEAD_STATUSES as readonly string[]).includes(st)) return true;
  return false;
}

// ---------------------------------------------------------------- sequences
export interface SequenceStepLike {
  step: number;
  subject: string;
  body: string;
  delayDays?: number | null;
  delayMinutes?: number | null;
  businessDaysOnly?: number | boolean | null;
  variant?: string | null;
}

/** The next step after `currentStep` (lowest step number greater than it), or null. */
export function selectNextStep<T extends SequenceStepLike>(
  steps: T[],
  currentStep: number,
): T | null {
  const sorted = [...steps].sort((a, b) => a.step - b.step);
  return sorted.find((s) => s.step > currentStep) ?? null;
}

/** The step with exactly this number, or null. */
export function getStepByNumber<T extends SequenceStepLike>(
  steps: T[],
  stepNumber: number,
): T | null {
  return steps.find((s) => s.step === stepNumber) ?? null;
}

/** The first step of a sequence (lowest step number), or null when empty. */
export function getFirstStep<T extends SequenceStepLike>(steps: T[]): T | null {
  if (steps.length === 0) return null;
  return [...steps].sort((a, b) => a.step - b.step)[0];
}
