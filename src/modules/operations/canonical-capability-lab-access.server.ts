import { getRequest } from "@tanstack/react-start/server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/** Canonical provider scope with a caller-selected functional permission.
 * Existing assessment callers retain their previous stricter gate until
 * each operation has an explicitly reviewed permission contract.
 */
export async function requireCanonicalLabProvider(
  requiredCapability: string = "noncredit.assessment.provision",
) {
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId || !["site_admin", "registrar"].includes(actor.role ?? "")) {
    throw new AuthorizationError("canonical provider staff");
  }
  assertCapability(actor, requiredCapability);
  const orgIds = actor.scope.organizationIds ?? [];
  if (orgIds.length !== 1 || !(actor.scope.siteIds?.length)) {
    throw new AuthorizationError("single provider organization and authorized Site");
  }
  return { actor, organizationId: orgIds[0]!, siteIds: actor.scope.siteIds! };
}
