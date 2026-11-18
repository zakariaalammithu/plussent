// PlaseSent tenant isolation — every tenant-scoped query MUST filter by
// workspaceId, and membership must be checked before any workspace data is
// returned. Use assertWorkspaceAccess() at the top of every workspace route.
import { and, eq } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { db as dbInstance } from "./db";
import { workspaceMembers } from "./db/schema";

export type Db = typeof dbInstance;

export type WorkspaceRole = "owner" | "admin" | "member" | "viewer";

const ROLE_RANK: Record<string, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

/** True when `role` is at least `minRole` in the owner > admin > member > viewer hierarchy. */
export function roleAtLeast(role: string, minRole: WorkspaceRole): boolean {
  return (ROLE_RANK[role] ?? 0) >= (ROLE_RANK[minRole] ?? 0);
}

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;

/**
 * Return the membership row when `userId` belongs to `workspaceId`, else null.
 * This is the single choke point for workspace access — do not bypass it.
 */
export async function assertWorkspaceAccess(
  database: Db,
  userId: string,
  workspaceId: string,
): Promise<WorkspaceMember | null> {
  if (!userId || !workspaceId) return null;
  const [member] = await database
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  return member ?? null;
}

/** Boolean version of assertWorkspaceAccess. */
export async function isWorkspaceMember(
  database: Db,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  return (await assertWorkspaceAccess(database, userId, workspaceId)) !== null;
}

/** Like assertWorkspaceAccess, but throws a 403-style Error when not a member. */
export async function assertWorkspaceAccessOrThrow(
  database: Db,
  userId: string,
  workspaceId: string,
  minRole?: WorkspaceRole,
): Promise<WorkspaceMember> {
  const member = await assertWorkspaceAccess(database, userId, workspaceId);
  if (!member) {
    const err = new Error("forbidden: user is not a member of this workspace");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  if (minRole && !roleAtLeast(member.role, minRole)) {
    const err = new Error(`forbidden: requires role ${minRole} or higher`);
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return member;
}

/**
 * Workspace-scoped query guard: returns the drizzle equality condition every
 * tenant query must include, so a missing filter is a compile-visible omission
 * rather than a silent leak. Example:
 *   db.select().from(leads).where(and(workspaceScope(wsId, leads.workspaceId), ...))
 */
export function workspaceScope(workspaceId: string, column: AnySQLiteColumn) {
  return eq(column, workspaceId);
}
