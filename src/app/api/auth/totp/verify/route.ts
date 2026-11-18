// POST /api/auth/totp/verify — confirm a TOTP code and enable 2FA.
// Also used to re-verify after a fresh setup (setup regenerates the secret).
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auditLog, errorJson, requireAuth } from "@/lib/auth";
import { decryptSecret, verifyTotp } from "@/lib/crypto";
import { db, now } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const verifySchema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = verifySchema.safeParse(body);
  if (!parsed.success) return errorJson("invalid_code", 400);
  if (!auth.user.totpSecret) return errorJson("totp_not_setup", 400);
  let secret: string;
  try {
    secret = decryptSecret(auth.user.totpSecret);
  } catch {
    return errorJson("totp_not_setup", 400);
  }
  if (!verifyTotp(secret, parsed.data.code)) {
    return errorJson("invalid_totp", 401);
  }
  await db
    .update(users)
    .set({ totpEnabled: 1, updatedAt: now() })
    .where(eq(users.id, auth.user.id));
  await auditLog({ workspaceId: auth.workspaceId, userId: auth.user.id, action: "user.totp_enabled", entity: "user", entityId: auth.user.id });
  return NextResponse.json({ ok: true, totpEnabled: true });
}
