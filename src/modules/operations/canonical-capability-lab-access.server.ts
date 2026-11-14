import { getRequest } from "@tanstack/react-start/server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/** Single, native canonical provider boundary shared by temporary Lab readers. */
export async function requireCanonicalLabProvider() {
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId || !["site_admin", "registrar"].includes(actor.role ?? "")) {
    throw new AuthorizationError("canonical provider staff");
  }
  assertCapability(actor, "noncredit.assessment.provision");
  const orgIds = actor.scope.organizationIds ?? [];
  if (orgIds.length !== 1 || !(actor.scope.siteIds?.length)) {
    throw new AuthorizationError("single provider organization and authorized Site");
  }
  return { actor, organizationId: orgIds[0]!, siteIds: actor.scope.siteIds! };
}
