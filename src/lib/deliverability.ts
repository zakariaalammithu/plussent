// PlusSent — deliverability checks (Module B).
// Real DNS lookups via node:dns/promises. Nothing is faked: a failed lookup
// reports ok:false with the error, and DKIM reports "not_checked" honestly
// when no selector is configured (DKIM cannot be checked without one).
import { resolveMx, resolveTxt } from "node:dns/promises";

const DNS_TIMEOUT_MS = 8_000;

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("dns_timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function txtRecords(name: string): Promise<string[]> {
  const records = await withTimeout(resolveTxt(name), DNS_TIMEOUT_MS);
  return records.map((parts) => parts.join(""));
}

export interface DnsCheck {
  ok: boolean;
  records?: string[];
  record?: string;
  error?: string;
}

export interface DkimCheck {
  status: "ok" | "missing" | "not_checked" | "error";
  selector?: string;
  record?: string;
  error?: string;
}

export interface DomainCheckResult {
  domain: string;
  checkedAt: string; // ISO timestamp
  mx: DnsCheck;
  spf: DnsCheck;
  dmarc: DnsCheck;
  dkim: DkimCheck;
}

function cleanDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/\.$/, "");
}

export function isPlausibleDomain(domain: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(cleanDomain(domain));
}

/** MX + SPF + DMARC (+ DKIM when a selector is supplied) for a domain. */
export async function checkDomain(
  domainInput: string,
  dkimSelector?: string | null,
): Promise<DomainCheckResult> {
  const domain = cleanDomain(domainInput);
  const checkedAt = new Date().toISOString();

  const mx: DnsCheck = { ok: false };
  try {
    const recs = await withTimeout(resolveMx(domain), DNS_TIMEOUT_MS);
    mx.records = recs.map((r) => `${r.priority} ${r.exchange}`);
    mx.ok = recs.length > 0;
    if (!mx.ok) mx.error = "no_mx_records";
  } catch (e) {
    mx.error = e instanceof Error ? e.message : "mx_lookup_failed";
  }

  const spf: DnsCheck = { ok: false };
  try {
    const recs = await txtRecords(domain);
    const spfRec = recs.find((r) => r.trim().toLowerCase().startsWith("v=spf1"));
    if (spfRec) {
      spf.ok = true;
      spf.record = spfRec;
      spf.records = recs;
    } else {
      spf.error = "no_spf_record";
    }
  } catch (e) {
    spf.error = e instanceof Error ? e.message : "spf_lookup_failed";
  }

  const dmarc: DnsCheck = { ok: false };
  try {
    const recs = await txtRecords(`_dmarc.${domain}`);
    const dmarcRec = recs.find((r) => r.trim().toLowerCase().startsWith("v=dmarc1"));
    if (dmarcRec) {
      dmarc.ok = true;
      dmarc.record = dmarcRec;
      dmarc.records = recs;
    } else {
      dmarc.error = "no_dmarc_record";
    }
  } catch (e) {
    dmarc.error = e instanceof Error ? e.message : "dmarc_lookup_failed";
  }

  const dkim: DkimCheck = { status: "not_checked" };
  if (dkimSelector && dkimSelector.trim() !== "") {
    const selector = dkimSelector.trim();
    dkim.selector = selector;
    try {
      const recs = await txtRecords(`${selector}._domainkey.${domain}`);
      const dkimRec = recs.find((r) => r.trim().toLowerCase().startsWith("v=dkim1"));
      if (dkimRec) {
        dkim.status = "ok";
        dkim.record = dkimRec;
      } else {
        dkim.status = "missing";
        dkim.error = "no_dkim_record_for_selector";
      }
    } catch (e) {
      dkim.status = "error";
      dkim.error = e instanceof Error ? e.message : "dkim_lookup_failed";
    }
  }

  return { domain, checkedAt, mx, spf, dmarc, dkim };
}

export interface EmailSyntaxResult {
  valid: boolean;
  email: string;
  domain: string | null;
  error?: string;
}

export function verifyEmailSyntax(emailInput: string): EmailSyntaxResult {
  const email = emailInput.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return { valid: false, email, domain: null, error: "invalid_email_format" };
  }
  return { valid: true, email, domain: email.split("@")[1] };
}

export interface EmailVerifyResult extends EmailSyntaxResult {
  mxOk: boolean;
  mxRecords?: string[];
  mxError?: string;
}

/** Syntax check + real MX lookup for the email's domain. Never fakes a pass. */
export async function verifyEmail(emailInput: string): Promise<EmailVerifyResult> {
  const syntax = verifyEmailSyntax(emailInput);
  if (!syntax.valid || !syntax.domain) return { ...syntax, mxOk: false };
  try {
    const recs = await withTimeout(resolveMx(syntax.domain), DNS_TIMEOUT_MS);
    const mxRecords = recs.map((r) => `${r.priority} ${r.exchange}`);
    return { ...syntax, mxOk: recs.length > 0, mxRecords, mxError: recs.length ? undefined : "no_mx_records" };
  } catch (e) {
    return { ...syntax, mxOk: false, mxError: e instanceof Error ? e.message : "mx_lookup_failed" };
  }
}
