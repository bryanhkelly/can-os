import type { AccessContext } from "./access-context";

/**
 * A CAN login is the only staff sign-in. An exact active CAN Site grant
 * and immutable public Person are revalidated by the restricted SQL reader.
 * No secondary native Person, staff grant or correspondence is authorized.
 * A baseline Site grant never awards independent review privileges.
 */
export function canResolveCanSiteStaff(
  actor: Pick<AccessContext, "role" | "accountId" | "actorPersonId" |
    "grantSiteId" | "sessionAccountId" | "scope" | "capabilities">,
): boolean {
  return (actor.role === "site_admin" || actor.role === "registrar" ||
    actor.role === "room_facilitator") &&
    Boolean(actor.accountId && actor.actorPersonId && actor.grantSiteId) &&
    // Synthetic demo delegation never proves the human owns the selected Person.
    !actor.sessionAccountId &&
    actor.scope.organizationIds?.length === 1 &&
    Boolean(actor.grantSiteId && actor.scope.siteIds?.includes(actor.grantSiteId));
}
