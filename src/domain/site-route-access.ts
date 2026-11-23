import type { CommandContext } from "./command-context";

/** Derived ONLY from a current, server-verified identity context.
 * An empty or missing Site list denies lookup, even for Org-level members.
 * getCommandContext expands Organization-wide grants to the permitted Site IDs.
 * Platform-owner "view as" uses the effective member's scope, not owner powers.
 */
export function scopedSiteRouteAccess(
  actor: Pick<CommandContext, "actorPersonId" | "scope"> & { grantSiteId?: string | null },
): { organizationIds: string[]; siteIds: string[] } | null {
  const organizationIds = actor.scope.organizationIds;
  const siteIds = actor.scope.siteIds;
  if (!actor.actorPersonId || !organizationIds?.length || !siteIds?.length) return null;
  if (actor.grantSiteId) {
    if (!siteIds.includes(actor.grantSiteId)) return null;
    return { organizationIds, siteIds: [actor.grantSiteId] };
  }
  return { organizationIds, siteIds };
}
