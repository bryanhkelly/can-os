import type { QueryClient } from "@tanstack/react-query";
import { selectApiMembership } from "@/lib/api/browser-session";
import { clearWorkspaceQueries } from "@/lib/api/workspace-query-scope";
import { getWorkspaceHome } from "@/components/shell/workspace-navigation.registry";

type MembershipGrant = { id: string; role: string };

export async function switchVerifiedMembership({
  grants,
  activeGrantId,
  grantId,
  queryClient,
  redirectTo,
}: {
  grants: readonly MembershipGrant[];
  activeGrantId: string;
  grantId: string;
  queryClient: QueryClient;
  redirectTo?: string;
}): Promise<void> {
  const target = grants.find(grant => grant.id === grantId);
  if (!target) throw new Error("This membership is unavailable.");

  const destination = redirectTo ?? getWorkspaceHome(target.role) ?? "/";
  const redirect = new URL(destination, window.location.origin);
  if (redirect.origin !== window.location.origin) throw new Error("The requested destination is unavailable.");

  if (target.id !== activeGrantId) {
    // Stop reads from the previous membership before changing the session.
    await queryClient.cancelQueries();
    await selectApiMembership(target.id);
    await clearWorkspaceQueries(queryClient);
  }

  window.location.assign(`${redirect.pathname}${redirect.search}${redirect.hash}`);
}