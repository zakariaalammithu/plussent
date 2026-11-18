// /api/auth/profile — current user's profile.
// GET: returns id, email, fullName, emailVerifiedAt.
// PATCH: updates fullName. Email changes are REJECTED with a clear message:
// changing the login email requires a re-verification flow and there is no
// pending-email column in the schema to hold the unverified address, so it
// is not silently applied. (If email change is wanted later, add a
// pendingEmail + verification step; do not set the new email unverified.)
import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auditLog, errorJson, requireAuth } from "@/lib/auth";
import { db, now } from "@/lib/db";
import { users } from "@/lib/db/schema";

function publicUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    emailVerifiedAt: user.emailVerifiedAt,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  return NextResponse.json({ ok: true, user: publicUser(auth.user) });
}

const patchSchema = z
  .object({
    fullName: z.string().min(1).max(120).optional(),
    email: z.string().email().max(255).optional(),
  })
  .refine((v) => v.fullName !== undefined || v.email !== undefined, {
    message: "nothing to update",
  });

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorJson("invalid_json", 400);
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_failed", issues: parsed.error.issues }, { status: 400 });
  }
  if (parsed.data.email !== undefined && parsed.data.email.toLowerCase() !== auth.user.email) {
    return NextResponse.json(
      {
        error: "email_change_requires_verification",
        message:
          "Changing your email requires re-verification, which is not available yet. Your email was not changed.",
      },
      { status: 400 },
    );
  }
  if (parsed.data.fullName === undefined) {
    return NextResponse.json({ ok: true, user: publicUser(auth.user) });
  }
  const fullName = parsed.data.fullName.trim();
  await db
    .update(users)
    .set({ fullName, updatedAt: now() })
    .where(eq(users.id, auth.user.id));
  await auditLog({ workspaceId: auth.workspaceId, userId: auth.user.id, action: "user.profile_updated", entity: "user", entityId: auth.user.id });
  const [updated] = await db.select().from(users).where(eq(users.id, auth.user.id)).limit(1);
  return NextResponse.json({ ok: true, user: publicUser(updated) });
}
