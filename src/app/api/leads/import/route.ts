// POST /api/leads/import — import leads from CSV text + a column mapping.
// Returns a full import report: { total, imported, invalid: [{row, reason}], skippedEmpty }.
// Invalid rows are reported, never silently discarded. Duplicates (in-file or
// already in this workspace) are reported as invalid, not imported.
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, readJson } from "@/lib/api-auth";
import { parseLeads } from "@/lib/csv";
import { db, makeId, now } from "@/lib/db";
import { leads } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const MAX_ROWS = 5000;

const importSchema = z.object({
  csv: z.string().min(1, "csv text is required").max(5_000_000),
  mapping: z.record(z.string(), z.string()).optional(),
  listId: z.string().max(100).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { csv, mapping, listId } = parsed.data;

  // Existing emails in this workspace (dedupe target).
  const existingRows = await db
    .select({ email: leads.email })
    .from(leads)
    .where(eq(leads.workspaceId, auth.workspaceId));
  const existing = new Set(existingRows.map((r) => r.email.toLowerCase()));

  const result = parseLeads(csv, mapping, existing);
  if (result.totalRows > MAX_ROWS) {
    return NextResponse.json(
      { error: "too_many_rows", message: `Import is limited to ${MAX_ROWS} rows per request; got ${result.totalRows}.` },
      { status: 400 },
    );
  }

  const invalid = [...result.invalid];
  let imported = 0;
  for (const lead of result.valid) {
    try {
      await db.insert(leads).values({
        id: makeId("lead"),
        workspaceId: auth.workspaceId,
        firstName: lead.firstName ?? null,
        lastName: lead.lastName ?? null,
        email: lead.email,
        phone: lead.phone ?? null,
        company: lead.company ?? null,
        website: lead.website ?? null,
        jobTitle: lead.jobTitle ?? null,
        industry: lead.industry ?? null,
        country: lead.country ?? null,
        city: lead.city ?? null,
        linkedinUrl: lead.linkedinUrl ?? null,
        tags: "[]",
        customFields: JSON.stringify(lead.customFields ?? {}),
        verificationStatus: "unverified",
        listId: listId ?? null,
        createdAt: now(),
        updatedAt: now(),
      });
      imported++;
    } catch (e) {
      // E.g. a race with another import hitting the unique index.
      invalid.push({
        row: 0,
        reason: `insert failed for ${lead.email}: ${e instanceof Error ? e.message : "unknown error"}`,
        email: lead.email,
      });
    }
  }
  // Keep the original row numbers meaningful: sort invalid by row (row 0 = unknown last).
  invalid.sort((a, b) => a.row - b.row);
  return NextResponse.json({
    ok: true,
    total: result.totalRows,
    imported,
    invalid,
    skippedEmpty: result.skippedEmpty,
  });
}
