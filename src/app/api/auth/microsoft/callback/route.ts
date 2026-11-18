// GET /api/auth/microsoft/callback — exchanges the code for tokens (only when
// Microsoft OAuth is configured), stores encrypted tokens in email_accounts,
// creates a session and redirects to /dashboard. Else 503.
import type { NextRequest } from "next/server";
import { handleOAuthCallback } from "../../_oauth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return handleOAuthCallback("microsoft", req);
}
