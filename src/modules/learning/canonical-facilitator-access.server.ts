import { getRequest } from "@tanstack/react-start/server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";

/**
 * Purpose-specific, native canonical room role.
 * A room facilitator may control a validated Site's delivery, but cannot
 * provision assessments, issue credentials, edit grades or review learner data.
 * The deployment and operation-site relationships are checked independently
 * by the facilitated-learning command before access to a room or playback.
 */
export async function requireCanonicalFacilitator() {
  const actor = await getCanonicalCommandContext(getRequest());
  if (!actor.actorPersonId ||
      !["room_facilitator", "site_admin", "registrar"].includes(actor.role ?? "")) {
    throw new AuthorizationError("canonical room facilitator");
  }
  assertCapability(actor, "learning.room.facilitate");
  const organizationIds = actor.scope.organizationIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  if (organizationIds.length !== 1 || siteIds.length !== 1) {
    throw new AuthorizationError("one current Site and its host organization");
  }
  return { actor, organizationId: organizationIds[0]!, siteIds };
}
