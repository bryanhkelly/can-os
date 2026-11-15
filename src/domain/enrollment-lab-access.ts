import type { AccessContext } from "./access-context";

/**
 * The legacy school session may open the read-only enrollment experience preview.
 * This is never a native canonical identity or a grant to canonical records.
 */
export function canPreviewEnrollmentLabAsSiteStaff(
  context: Pick<AccessContext,
    "role" | "actorPersonId" | "grantSiteId" | "scope" | "capabilities">,
): boolean {
  const siteId = context.grantSiteId;
  return (context.role === "site_admin" || context.role === "registrar") &&
    Boolean(context.actorPersonId && siteId) &&
    (context.scope.organizationIds?.length ?? 0) > 0 &&
    Boolean(siteId && context.scope.siteIds?.includes(siteId)) &&
    context.capabilities.has("enrollment:manage");
}
