import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError,assertCapability } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit,type MutationTx } from "@/platform/mutation";
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

export {actorSiteIds,assertProgramGranted,assertSiteGranted} from "./actor-scope.server";

/**
 * Append an audit row attributing the mutation to the verified account, session and role.
 * Pass the active transaction so the audit row commits with the mutation.
 */
export async function recordAudit(
  tx: MutationTx,
  actor: Actor,
  entry: {
    action: string;
    resourceType: string;
    resourceId: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    scope?: Record<string, unknown>;
  },
): Promise<void> {
  await writeAudit(tx, {
    actorPersonId: actor.actorPersonId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId,
    scope: entry.scope ?? {},
    before: entry.before ?? null,
    after: entry.after ?? null,
    context: {
      accountId: actor.accountId,
      sessionId: actor.sessionId,
      role: actor.role,
      ...((actor.impersonatedByAccountId ?? actor.sessionAccountId)
        ? { sessionAccountId: actor.impersonatedByAccountId ?? actor.sessionAccountId } : {}),
      ...(actor.requestId ? { requestId: actor.requestId } : {}),
    },
  });
}
