import type { AccessContext } from "./access-context";

/**
 * A CAN login is the only staff sign-in. A verified session alone is NOT a
 * canonical grant. A staff bridge must also pass independently reviewed
 * Person and Site mappings plus a current canonical staff grant.
 */
export function canResolveCanSiteStaff(
  actor: Pick<AccessContext, "role" | "accountId" | "actorPersonId" |
    "grantSiteId" | "sessionAccountId" | "scope" | "capabilities">,
): boolean {
  return (actor.role === "site_admin" || actor.role === "registrar") &&
    Boolean(actor.accountId && actor.actorPersonId && actor.grantSiteId) &&
    (!actor.sessionAccountId || actor.sessionAccountId === actor.accountId) &&
    actor.scope.organizationIds?.length === 1 &&
    Boolean(actor.grantSiteId && actor.scope.siteIds?.includes(actor.grantSiteId)) &&
    actor.capabilities.has("enrollment:manage");
}

/** Every effective school Person must be the explicitly mapped CAN Person. */
export function hasUnambiguousCanPerson(
  actorPersonId: string,
  activePersonIds: readonly string[],
): boolean {
  return activePersonIds.length > 0 && activePersonIds.length <= 100 &&
    activePersonIds.every(id => id === actorPersonId);
}

export type CanonicalStaffGrantCandidate = {
  personId: string;
  grantId: string;
  roleCode: string;
  siteId: string | null;
  organizationId: string;
};

export function selectExactCanonicalStaffGrant(
  grants: readonly CanonicalStaffGrantCandidate[],
  expected: { personId: string; roleCode: "site_admin" | "registrar"; siteId: string },
): CanonicalStaffGrantCandidate | null {
  // An ambiguous role/person/Site mapping must never silently pick a principal.
  return grants.length === 1 &&
    grants[0]?.personId === expected.personId &&
    grants[0]?.roleCode === expected.roleCode &&
    grants[0]?.siteId === expected.siteId ? grants[0] : null;
}
