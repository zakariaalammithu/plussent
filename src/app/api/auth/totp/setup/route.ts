// POST /api/auth/totp/setup — start TOTP 2FA enrolment.
// Generates a secret, stores it ENCRYPTED (AES-256-GCM), leaves totpEnabled=0
// until /totp/verify confirms a code. Returns the secret + otpauth URL once
// for the user to scan into their authenticator app.
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { generateTotpSecret, requireAuth, totpAuthUrl } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";
import { db, now } from "@/lib/db";
import { users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const secret = generateTotpSecret();
  await db
    .update(users)
    .set({ totpSecret: encryptSecret(secret), updatedAt: now() })
    .where(eq(users.id, auth.user.id));
  return NextResponse.json({
    ok: true,
    secret,
    otpauthUrl: totpAuthUrl(secret, auth.user.email),
    message: "Scan the QR code (or enter the secret) in your authenticator app, then confirm with a code.",
  });
}
