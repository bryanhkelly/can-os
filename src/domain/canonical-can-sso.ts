import type { AccessContext } from "./access-context";

/**
 * A CAN login is the only staff sign-in. A verified session alone is NOT a
 * canonical grant. A staff bridge must also pass independently reviewed
 * Person and Site mappings plus a current canonical staff grant.
 * Authentication must never depend on an enrollment-specific permission.
 */
export function canResolveCanSiteStaff(
  actor: Pick<AccessContext, "role" | "accountId" | "actorPersonId" |
    "grantSiteId" | "sessionAccountId" | "scope" | "capabilities">,
): boolean {
  return (actor.role === "site_admin" || actor.role === "registrar") &&
    Boolean(actor.accountId && actor.actorPersonId && actor.grantSiteId) &&
    // Synthetic demo delegation never proves the human owns the selected Person.
    !actor.sessionAccountId &&
    actor.scope.organizationIds?.length === 1 &&
    Boolean(actor.grantSiteId && actor.scope.siteIds?.includes(actor.grantSiteId));
}

/** Every effective school Person must be the explicitly mapped CAN Person. */
export function hasUnambiguousCanPerson(
  actorPersonId: string,
  activePersonIds: readonly string[],
): boolean {
  return activePersonIds.length > 0 && activePersonIds.length <= 100 &&
    activePersonIds.every(id => id === actorPersonId);
}
