import type { AccessContext } from "./access-context";
import { AuthorizationError } from "./command-context";

export const sitePublicationManageCapability = "site.publication.manage";

/**
 * Preliminary bound check on the verified session. An explicit institutional
 * RoleAssignment is ALSO required by the server query before any read/write.
 */
export function assertSitePublicationScope(
  actor: AccessContext,
  site: { id: string; organizationId: string },
): void {
  if (!actor.actorPersonId || actor.role !== "registrar" ||
      !actor.capabilities.has(sitePublicationManageCapability) ||
      !actor.scope.organizationIds?.includes(site.organizationId) ||
      !actor.scope.siteIds?.includes(site.id)) {
    throw new AuthorizationError("site publication manager scope");
  }
}
