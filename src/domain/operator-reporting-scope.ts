import type { AccessContext } from "./access-context";
import { AuthorizationError, assertCapability } from "./command-context";

/** Local operational reports are read-only and use the exact active Site grant. */
export function resolveOperatorReportingScope(actor: AccessContext) {
  const orgs = actor.scope.organizationIds ?? [];
  const sites = actor.scope.siteIds ?? [];
  if (!actor.actorPersonId || !["site_admin", "registrar"].includes(actor.role) ||
      actor.sessionAccountId || !actor.grantSiteId || orgs.length !== 1 ||
      sites.length !== 1 || sites[0] !== actor.grantSiteId) {
    throw new AuthorizationError("current exact Site reporting membership");
  }
  assertCapability(actor, "insights:read");
  return { actor, organizationId: orgs[0]!, siteIds: [actor.grantSiteId] };
}
