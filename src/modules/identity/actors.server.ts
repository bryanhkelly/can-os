import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError,assertCapability } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getRequest } from "@tanstack/react-start/server";
import { rolesAllow } from "@/domain/school-roles";

export type ActorRole = "student" | "teacher" | "guardian" | "registrar" | "site_admin" | "specialist" | "counselor" | "room_facilitator" | "site_leader" | "site_staff" | "safeguarding_responder" | "safeguarding_lead";

export type Actor = AccessContext & { actorPersonId: string };

/**
 * Resolve the signed-in actor for the current request. Role and scope come from
 * the server session's verified grant, never from the caller.
 */
export async function requireActor(
  roles: readonly ActorRole[],
  capability?: string,
): Promise<Actor> {
  const context = await getCommandContext(getRequest());
  if (!context.actorPersonId) throw new AuthorizationError("authenticated person");
  if (!rolesAllow(roles, context.role)) {
    throw new AuthorizationError(`role: ${roles.join(" or ")}`);
  }
  if (capability) assertCapability(context, capability);
  return context as Actor;
}

export function actorSiteIds(actor: Actor): string[] {
  const sites = actor.scope.siteIds ?? [];
  if (sites.length === 0) throw new AuthorizationError("site membership");
  return sites;
}

/** Unlike assertProgramScope, an empty grant projection denies everything. */
export function assertProgramGranted(actor: Actor, programId: string | null | undefined): void {
  if (!programId || !(actor.scope.programIds ?? []).includes(programId)) {
    throw new AuthorizationError("program scope");
  }
}

export function assertSiteGranted(actor: Actor, siteId: string | null | undefined): void {
  if (!siteId || !actorSiteIds(actor).includes(siteId)) {
    throw new AuthorizationError("site scope");
  }
}

export {recordAudit} from "./actor-audit.server";
