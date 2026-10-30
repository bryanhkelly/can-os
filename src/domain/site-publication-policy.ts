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

/**
 * Church partner access is a separate capability and a STRICTLY site-bound
 * active membership. An organization-wide role or verified registrar grant
 * does not turn a partner into the institutional publisher, and vice versa.
 * The server also checks a matching current role assignment and membership.
 */
export const siteWebsiteDraftReadCapability = "site.website.draft.read";
export const siteWebsiteLocalPublishCapability = "site.website.local.publish";

export function assertPartnerWebsitePreviewScope(
  actor: AccessContext,
  site: { id: string; organizationId: string },
): void {
  if (!actor.actorPersonId ||
      actor.role !== "site_website_editor" ||
      actor.grantSiteId !== site.id ||
      !actor.capabilities.has(siteWebsiteDraftReadCapability) ||
      !actor.scope.organizationIds?.includes(site.organizationId) ||
      !actor.scope.siteIds?.includes(site.id)) {
    throw new AuthorizationError("partner website preview scope");
  }
}
