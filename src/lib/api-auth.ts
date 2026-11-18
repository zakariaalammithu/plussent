// PlaseSent — Module B API auth helper.
// Wraps src/lib/auth.ts (owned by the auth builder): requireAuth gives the
// session user; the workspace is the session workspace when set, otherwise
// the user's first workspace membership. Every Module B route resolves its
// workspace through here and filters every query by it.
import { eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { getUserMemberships, requireAuth, type AuthContext } from "./auth";
import { db } from "./db";
import { workspaceMembers } from "./db/schema";

export interface WorkspaceAuth {
  user: AuthContext["user"];
  userId: string;
  workspaceId: string;
  role: string;
}

/** Resolve auth + workspace, or return a 401/403 Response to send directly. */
export async function getWorkspaceAuth(req: NextRequest): Promise<WorkspaceAuth | Response> {
  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  let workspaceId = auth.workspaceId;
  if (!workspaceId) {
    const memberships = await getUserMemberships(auth.user.id);
    workspaceId = memberships[0]?.workspaceId ?? null;
  }
  if (!workspaceId) {
    return NextResponse.json(
      { error: "no_workspace", message: "This account has no workspace yet." },
      { status: 403 },
    );
  }
  // Confirm membership (session workspace could be stale) and get the role.
  const mine = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, auth.user.id))
    .limit(10);
  const myMembership = mine.find((m) => m.workspaceId === workspaceId);
  if (!myMembership) {
    return NextResponse.json(
      { error: "forbidden", message: "Not a member of this workspace." },
      { status: 403 },
    );
  }
  return { user: auth.user, userId: auth.user.id, workspaceId, role: myMembership.role };
}

export function parsePagination(url: URL): { page: number; limit: number; offset: number } {
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
  return { page, limit, offset: (page - 1) * limit };
}

export function err(message: string, status = 400): Response {
  return NextResponse.json({ error: message }, { status });
}

export function notFound(what = "not_found"): Response {
  return NextResponse.json({ error: what }, { status: 404 });
}

/** Parse a JSON body, returning null (and sending the 400) on bad JSON. */
export async function readJson<T>(req: NextRequest): Promise<{ data: T | null; error: Response | null }> {
  try {
    const data = (await req.json()) as T;
    return { data, error: null };
  } catch {
    return { data: null, error: err("invalid_json", 400) };
  }
}

export function parseDateParam(value: string | null, fallbackMs: number): number {
  if (!value) return fallbackMs;
  const n = Number(value);
  if (Number.isFinite(n) && n > 0) return n;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : fallbackMs;
}
