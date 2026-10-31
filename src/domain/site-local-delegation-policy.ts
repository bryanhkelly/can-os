import { AuthorizationError } from "./command-context";
import type { AccessContext } from "./access-context";

export const localResponsibilityRoles = {
  site_director: "site_leader",
  room_facilitator: "room_facilitator",
} as const;
export type LocalResponsibility = keyof typeof localResponsibilityRoles;

export function assertLocalDelegationIssuer(actor: AccessContext, resource: {
  organizationId: string; siteId: string; programId: string;
}) {
  if (actor.demoFacilitator || !actor.actorPersonId ||
      actor.role !== "registrar" || !actor.capabilities.has("admin.manage") ||
      !actor.scope.organizationIds?.includes(resource.organizationId) ||
      !actor.scope.siteIds?.includes(resource.siteId) ||
      !actor.scope.programIds?.includes(resource.programId) ||
      (actor.grantSiteId != null && actor.grantSiteId !== resource.siteId)) {
    throw new AuthorizationError("host registrar may delegate only within their verified Site and Program");
  }
}
export function assertLocalDelegateGrant(input: {
  role: string; active: boolean; verified: boolean; samePerson: boolean;
  organizationMatches: boolean; siteMatches: boolean;
}, responsibility: LocalResponsibility) {
  if (input.role !== localResponsibilityRoles[responsibility] ||
      !input.active || !input.verified || !input.samePerson ||
      !input.organizationMatches || !input.siteMatches) {
    throw new AuthorizationError("verified, active, exact-Site local staff grant required");
  }
}
export function delegationExpiration(validThrough: string, now = new Date()): Date {
  const end = new Date(validThrough);
  if (!Number.isFinite(end.getTime()) ||
      end.getTime() <= now.getTime() ||
      end.getTime() > now.getTime() + 90 * 86400_000) {
    throw new Error("Site delegation must expire within the next 90 days");
  }
  return end;
}
