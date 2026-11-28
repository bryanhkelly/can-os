import type { QueryClient } from "@tanstack/react-query";
import type { WorkspaceSession } from "@/modules/identity/workspace-session.server";

type AuthenticatedSession = Extract<WorkspaceSession, { authenticated: true }>;
const sorted = (ids: readonly string[]) => [...new Set(ids)].sort();

/** Derive cache identity from a verified session, never a route parameter or local storage. */
export function workspaceApiScope(session: AuthenticatedSession) {
  const grant = session.grants.find(item => item.id === session.activeGrantId);
  if (!grant || grant.role !== session.role) throw new Error("Verified workspace membership required");
  return {
    personId: grant.personId,
    grantId: grant.id,
    role: session.role,
    organizations: sorted(session.activeContext.organizationIds),
    sites: sorted(session.activeContext.siteIds),
    programs: sorted(session.activeContext.programIds),
    delegation: session.ownerDelegation
      ? { mode: session.ownerDelegation.mode, expiresAt: new Date(session.ownerDelegation.expiresAt).toISOString() }
      : null,
  };
}

export function workspaceApiQueryKey(session: AuthenticatedSession, resource: string, parameters: readonly unknown[] = []) {
  return ["workspace-api", workspaceApiScope(session), resource, ...parameters] as const;
}

/** Cancel pending reads before dropping cache entries. Mutations are never replayed. */
export async function clearWorkspaceQueries(client: QueryClient) {
  await client.cancelQueries();
  client.clear();
}
