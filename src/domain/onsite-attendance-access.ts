import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";

/** Classroom-facing staff may record actual onsite attendance at ONE grant site.
 * This does not confer gradebook, counseling, case, check-out, guardian-excuse
 * review or schoolwide registrar authority. */
export const onsiteAttendanceRoles = ["room_facilitator", "site_staff", "site_leader"] as const;

export function isOnsiteAttendanceRole(role: string): boolean {
  return (onsiteAttendanceRoles as readonly string[]).includes(role);
}

export function assertOnsiteAttendanceScope(
  actor: AccessContext,
  siteId?: string | null,
): void {
  if (!isOnsiteAttendanceRole(actor.role) ||
      !actor.capabilities.has("onsite.attendance.record") ||
      !actor.actorPersonId || !actor.accountId || !actor.sessionId || !actor.grantId ||
      !actor.grantSiteId || !actor.scope.siteIds?.includes(actor.grantSiteId) ||
      !actor.scope.organizationIds?.length || !actor.scope.programIds?.length ||
      (siteId != null && actor.grantSiteId !== siteId)) {
    throw new AuthorizationError("active site-bound onsite attendance assignment");
  }
}
