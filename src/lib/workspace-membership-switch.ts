import type { QueryClient } from "@tanstack/react-query";
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
    const response = await fetch("/access/session", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: target.id }),
    });
    if (!response.ok) throw new Error("Unable to change membership.");
    queryClient.clear();
  }

  window.location.assign(`${redirect.pathname}${redirect.search}${redirect.hash}`);
}