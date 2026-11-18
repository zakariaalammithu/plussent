// PlusSent — CSV parsing + lead validation (Module B).
// Pure functions, no I/O. Invalid records are NEVER silently discarded:
// parseLeads returns them in `invalid` with a row number and a reason.
export const LEAD_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
  "website",
  "jobTitle",
  "industry",
  "country",
  "city",
  "linkedinUrl",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

export interface ParsedLead {
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  company?: string;
  website?: string;
  jobTitle?: string;
  industry?: string;
  country?: string;
  city?: string;
  linkedinUrl?: string;
  customFields?: Record<string, string>;
}

export interface InvalidRow {
  row: number; // 1-based file line number (header is line 1)
  reason: string;
  email?: string;
}

export interface ParseLeadsResult {
  valid: ParsedLead[];
  invalid: InvalidRow[];
  totalRows: number; // data rows seen (excluding the header)
  skippedEmpty: number; // fully-blank rows, counted not discarded silently
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * Parse CSV text into rows of fields. Handles quoted fields, "" escapes,
 * commas and newlines inside quotes, CRLF and LF line endings, and a BOM.
 * A trailing newline does not produce a phantom empty row.
 */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldStarted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      // A quote only opens a quoted field at the start of a field.
      if (!fieldStarted && field === "") {
        inQuotes = true;
        fieldStarted = true;
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      fieldStarted = false;
      continue;
    }
    if (ch === "\r") continue; // CRLF: ignore CR, LF ends the row
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      fieldStarted = false;
      continue;
    }
    field += ch;
    fieldStarted = true;
  }
  // Last line without a trailing newline.
  if (field !== "" || row.length > 0 || fieldStarted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_-]+/g, "");
}

// Common header spellings -> lead field (used when no explicit mapping is given).
const HEADER_ALIASES: Record<string, LeadField> = {
  firstname: "firstName",
  first: "firstName",
  lastname: "lastName",
  last: "lastName",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  company: "company",
  companyname: "company",
  website: "website",
  url: "website",
  jobtitle: "jobTitle",
  title: "jobTitle",
  industry: "industry",
  country: "country",
  city: "city",
  linkedinurl: "linkedinUrl",
  linkedin: "linkedinUrl",
};

function resolveMapping(
  headers: string[],
  mapping?: Record<string, string>,
): { field: LeadField | null; customKey: string | null; index: number }[] {
  const byNorm = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!byNorm.has(normalizeHeader(h))) byNorm.set(normalizeHeader(h), i);
  });
  const out: { field: LeadField | null; customKey: string | null; index: number }[] = [];
  if (mapping) {
    for (const [csvHeader, leadField] of Object.entries(mapping)) {
      const idx = byNorm.get(normalizeHeader(csvHeader));
      if (idx === undefined) continue; // mapped column not present in this file
      if (leadField.startsWith("custom.")) {
        out.push({ field: null, customKey: leadField.slice("custom.".length), index: idx });
      } else if ((LEAD_FIELDS as readonly string[]).includes(leadField)) {
        out.push({ field: leadField as LeadField, customKey: null, index: idx });
      }
      // Unknown mapping target: column is ignored (never guessed into a field).
    }
    return out;
  }
  headers.forEach((h, i) => {
    const field = HEADER_ALIASES[normalizeHeader(h)];
    if (field) out.push({ field, customKey: null, index: i });
  });
  return out;
}

/**
 * Map CSV rows to leads.
 * @param csvText raw CSV (first row = header)
 * @param mapping CSV header -> lead field (e.g. { "Email Address": "email" });
 *   when omitted, well-known header spellings are auto-matched.
 * @param existingEmails emails already in this workspace (dedupe target);
 *   duplicates are reported in `invalid`, never dropped silently.
 */
export function parseLeads(
  csvText: string,
  mapping?: Record<string, string>,
  existingEmails?: Set<string> | string[] | null,
): ParseLeadsResult {
  const rows = parseCsvText(csvText);
  const valid: ParsedLead[] = [];
  const invalid: InvalidRow[] = [];
  if (rows.length === 0) return { valid, invalid, totalRows: 0, skippedEmpty: 0 };
  const headers = rows[0];
  const colMap = resolveMapping(headers, mapping);
  const existing = new Set<string>();
  if (existingEmails) {
    for (const e of existingEmails) existing.add(String(e).trim().toLowerCase());
  }
  const seenInFile = new Set<string>();
  let skippedEmpty = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const lineNo = r + 1; // header is line 1
    if (row.every((c) => c.trim() === "")) {
      skippedEmpty++;
      continue;
    }
    const lead: ParsedLead = { email: "" };
    const customFields: Record<string, string> = {};
    for (const col of colMap) {
      const raw = (row[col.index] ?? "").trim();
      if (raw === "") continue;
      if (col.customKey) customFields[col.customKey] = raw;
      else if (col.field) (lead as unknown as Record<string, string>)[col.field] = raw;
    }
    const emailRaw = (lead.email ?? "").trim();
    if (!emailRaw) {
      invalid.push({ row: lineNo, reason: "missing required email" });
      continue;
    }
    if (!isValidEmail(emailRaw)) {
      invalid.push({ row: lineNo, reason: `invalid email format: ${emailRaw}`, email: emailRaw });
      continue;
    }
    const email = emailRaw.toLowerCase();
    lead.email = email;
    if (seenInFile.has(email)) {
      invalid.push({ row: lineNo, reason: `duplicate email in file: ${email}`, email });
      continue;
    }
    if (existing.has(email)) {
      invalid.push({ row: lineNo, reason: `duplicate email (already exists in workspace): ${email}`, email });
      continue;
    }
    seenInFile.add(email);
    if (Object.keys(customFields).length > 0) lead.customFields = customFields;
    valid.push(lead);
  }
  return { valid, invalid, totalRows: rows.length - 1, skippedEmpty };
}
