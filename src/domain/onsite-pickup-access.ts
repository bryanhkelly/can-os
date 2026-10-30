import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { isOnsiteAttendanceRole } from "@/domain/onsite-attendance-access";

/** Pickup authority is additive to, never inferred from, an attendance grant. */
export function assertOnsitePickupScope(actor: AccessContext, siteId?: string | null): void {
  if (!isOnsiteAttendanceRole(actor.role) ||
      !actor.capabilities.has("onsite.pickup.release") ||
      !actor.actorPersonId || !actor.accountId || !actor.sessionId || !actor.grantId ||
      !actor.grantSiteId || !actor.scope.siteIds?.includes(actor.grantSiteId) ||
      !actor.scope.organizationIds?.length || !actor.scope.programIds?.length ||
      (siteId != null && actor.grantSiteId !== siteId)) {
    throw new AuthorizationError("active site-bound verified pickup assignment");
  }
}
