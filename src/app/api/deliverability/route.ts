// POST /api/deliverability — real DNS checks for a sending domain, or a
// syntax + MX check for an email address. Results are stored on the domains
// table when a domain is checked. Nothing is faked: a failed lookup reports
// ok:false, and DKIM is "not_checked" unless a selector is supplied.
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, readJson } from "@/lib/api-auth";
import { db, makeId, now } from "@/lib/db";
import { domains } from "@/lib/db/schema";
import { checkDomain, isPlausibleDomain, verifyEmail } from "@/lib/deliverability";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const checkSchema = z
  .object({
    domain: z.string().trim().max(255).optional(),
    email: z.string().trim().max(320).optional(),
    dkimSelector: z.string().trim().max(100).optional(),
  })
  .refine((v) => v.domain || v.email, { message: "Provide domain or email." });

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = checkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { domain, email, dkimSelector } = parsed.data;

  if (email && !domain) {
    const result = await verifyEmail(email);
    return NextResponse.json({ ok: true, kind: "email", ...result });
  }

  const domainName = (domain as string).trim().toLowerCase().replace(/\.$/, "");
  if (!isPlausibleDomain(domainName)) {
    return NextResponse.json(
      { error: "invalid_domain", message: `"${domainName}" is not a plausible domain name.` },
      { status: 400 },
    );
  }
  const result = await checkDomain(domainName, dkimSelector ?? null);
  // Persist the latest check on the workspace's domains table (upsert by domain).
  const [existing] = await db
    .select()
    .from(domains)
    .where(and(eq(domains.workspaceId, auth.workspaceId), eq(domains.domain, domainName)))
    .limit(1);
  const row = {
    spfOk: result.spf.ok ? 1 : 0,
    dkimOk: result.dkim.status === "ok" ? 1 : 0,
    dmarcOk: result.dmarc.ok ? 1 : 0,
    mxOk: result.mx.ok ? 1 : 0,
    lastCheckedAt: now(),
  };
  if (existing) {
    await db.update(domains).set(row).where(eq(domains.id, existing.id));
  } else {
    await db.insert(domains).values({
      id: makeId("dom"),
      workspaceId: auth.workspaceId,
      domain: domainName,
      ...row,
      createdAt: now(),
    });
  }
  return NextResponse.json({ ok: true, kind: "domain", ...result });
}
