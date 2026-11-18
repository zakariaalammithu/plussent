// GET /api/auth/microsoft — OAuth START. Redirects to Microsoft's
// authorization URL when configured; 503 { error: "oauth_not_configured" } when not.
import { handleOAuthStart } from "../_oauth";

export const dynamic = "force-dynamic";

export async function GET() {
  return handleOAuthStart("microsoft");
}
