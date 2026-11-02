import { AuthorizationError, assertCapability } from "@/domain/command-context";
import type { AccessContext } from "@/domain/access-context";

/**
 * A verified denomination HQ grant is distinct from a school registrar.
 * Managing the denomination's own Site records grants no ability to read
 * academic, enrollment, medical or guardian records at those sites.
 */
export function assertNetworkSiteAccess(
  actor: AccessContext,
  organization: { id: string; type: string },
  capability: "network.sites.read" | "network.sites.manage" | "network.affiliations.read" | "network.affiliations.review",
): void {
  if (actor.role !== "network_admin" || !actor.actorPersonId || actor.grantSiteId !== null)
    throw new AuthorizationError("denomination HQ administrator");
  assertCapability(actor, capability);
  if (organization.type !== "denomination" ||
      !(actor.scope.organizationIds ?? []).includes(organization.id))
    throw new AuthorizationError("verified denomination organization");
}

/** Invalid timezones must not create operational Site records. */
export function assertIanaTimezone(timezone: string): void {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); }
  catch { throw new Error("Choose a valid IANA timezone"); }
}
