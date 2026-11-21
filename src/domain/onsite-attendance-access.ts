import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";

/** Explicit onsite Site staff may record attendance at ONE granted Site.
 * This does not confer gradebook, counseling, case, check-out, guardian-excuse
 * review or schoolwide registrar authority. */
export const onsiteAttendanceRoles = ["site_staff", "site_leader"] as const;

export function isOnsiteAttendanceRole(role: string): boolean {
  return (onsiteAttendanceRoles as readonly string[]).includes(role);
}

export function assertOnsiteAttendanceScope(
  actor: AccessContext,
  siteId?: string | null,
): void {
  assertOnsiteStaffSite(actor, siteId);
  if (!actor.scope.programIds?.length) throw new AuthorizationError("active onsite attendance Program assignment");
}

export function assertOnsiteStaffSite(actor: AccessContext, siteId?: string | null): void {
  if (!isOnsiteAttendanceRole(actor.role) ||
      !actor.capabilities.has("onsite.attendance.record") ||
      !actor.actorPersonId || !actor.accountId || !actor.sessionId || !actor.grantId ||
      !actor.grantSiteId || !actor.scope.siteIds?.includes(actor.grantSiteId) ||
      !actor.scope.organizationIds?.length ||
      (siteId != null && actor.grantSiteId !== siteId)) {
    throw new AuthorizationError("active site-bound onsite attendance assignment");
  }
}
