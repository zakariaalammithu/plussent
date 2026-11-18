// GET /api/auth/google — OAuth START. Redirects to Google's authorization
// URL when configured; 503 { error: "oauth_not_configured" } when not.
import { handleOAuthStart } from "../_oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleOAuthStart("google");
}
