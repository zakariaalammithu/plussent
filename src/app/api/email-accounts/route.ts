// GET /api/email-accounts — list accounts (credentials never returned) + status.
// POST — add an SMTP account: connection is verified with nodemailer before
// anything is stored; encrypted credentials only (AES-256-GCM, see lib/crypto).
import { desc, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceAuth, parsePagination, readJson } from "@/lib/api-auth";
import { encryptSecret } from "@/lib/crypto";
import { db, makeId, now } from "@/lib/db";
import { emailAccounts } from "@/lib/db/schema";
import { serializeAccount, testSmtpConnection } from "@/lib/smtp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createSchema = z.object({
  provider: z.enum(["gmail", "outlook", "smtp"]),
  email: z.string().trim().toLowerCase().email(),
  displayName: z.string().trim().max(200).optional(),
  host: z.string().trim().min(1, "SMTP host is required").max(255),
  port: z.number().int().min(1).max(65535).optional(),
  user: z.string().trim().min(1, "SMTP username is required"),
  pass: z.string().min(1, "SMTP password is required"),
  secure: z.boolean().optional(),
  dailyLimit: z.number().int().min(1).max(10000).optional(),
});

export async function GET(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { limit, offset } = parsePagination(req.nextUrl);
  const rows = await db
    .select()
    .from(emailAccounts)
    .where(eq(emailAccounts.workspaceId, auth.workspaceId))
    .orderBy(desc(emailAccounts.createdAt))
    .limit(limit)
    .offset(offset);
  return NextResponse.json({ ok: true, accounts: rows.map(serializeAccount) });
}

export async function POST(req: NextRequest) {
  const auth = await getWorkspaceAuth(req);
  if (auth instanceof Response) return auth;
  const { data: body, error } = await readJson<unknown>(req);
  if (error) return error;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const v = parsed.data;
  const port = v.port ?? 587;
  const secure = v.secure ?? port === 465;
  const creds = { host: v.host, port, secure, user: v.user, pass: v.pass };
  const check = await testSmtpConnection(creds);
  if (!check.ok) {
    return NextResponse.json(
      {
        error: "smtp_verify_failed",
        message: "Could not connect to the SMTP server with these credentials — account was NOT saved.",
        detail: check.error,
      },
      { status: 400 },
    );
  }
  const id = makeId("acct");
  await db.insert(emailAccounts).values({
    id,
    workspaceId: auth.workspaceId,
    provider: v.provider,
    email: v.email,
    displayName: v.displayName ?? null,
    encryptedCredentials: encryptSecret(JSON.stringify(creds)),
    status: "connected",
    lastError: null,
    dailyLimit: v.dailyLimit ?? 100,
    sentToday: 0,
    sentTodayDate: null,
    healthScore: 100,
    createdAt: now(),
    updatedAt: now(),
  });
  const [row] = await db.select().from(emailAccounts).where(eq(emailAccounts.id, id)).limit(1);
  return NextResponse.json({ ok: true, account: row ? serializeAccount(row) : null }, { status: 201 });
}
