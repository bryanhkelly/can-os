import { AuthorizationError } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";

/**
 * Onsite supervision is NOT a registrar/teacher/counselor/incident reviewer role.
 * These roles are first observers only until vetted safeguarding workflows,
 * on-duty escalation and jurisdiction rules are enabled.
 */
export const onsiteSafeguardingRoles = [
  "room_facilitator",
  "site_staff",
  "site_leader",
  "paraeducator",
] as const;

export type OnsiteSafeguardingRole = (typeof onsiteSafeguardingRoles)[number];

export function isOnsiteSafeguardingRole(role: string): role is OnsiteSafeguardingRole {
  return (onsiteSafeguardingRoles as readonly string[]).includes(role);
}

/** Only named single-site grants may be provisioned for reporter-only roles. */
export function assertSafeguardingStaffInviteSite(role: string, siteId: string | null | undefined): void {
  if (isOnsiteSafeguardingRole(role) && !siteId) {
    throw new AuthorizationError("onsite role requires explicit site selection");
  }
}

/**
 * Require a VERIFIED session/grant (never request-body staff identity).
 * A room/site staff grant must be for one actual site, not organization-wide.
 * Intended for future submit-only intake; it does not file an incident.
 */
export function assertOnsiteSafeguardingSubmissionScope(
  actor: AccessContext,
  siteId: string,
): void {
  if (!isOnsiteSafeguardingRole(actor.role) ||
      !actor.capabilities.has("safeguarding.concern.submit") ||
      !actor.actorPersonId ||
      !actor.accountId || !actor.sessionId || !actor.grantId ||
      !actor.scope.organizationIds?.length ||
      !actor.grantSiteId || actor.grantSiteId !== siteId ||
      !actor.scope.siteIds?.includes(siteId)) {
    throw new AuthorizationError("onsite safeguard report-only site grant");
  }
}
