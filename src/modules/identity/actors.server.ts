import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError,assertCapability } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit,type MutationTx } from "@/platform/mutation";
import { getRequest } from "@tanstack/react-start/server";

export type ActorRole = "student" | "teacher" | "guardian" | "registrar" | "specialist" | "counselor" | "room_facilitator" | "site_leader" | "site_staff" | "safeguarding_responder" | "safeguarding_lead";

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
  if (!roles.includes(context.role as ActorRole)) {
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
      ...(actor.sessionAccountId ? { sessionAccountId: actor.sessionAccountId } : {}),
      ...(actor.requestId ? { requestId: actor.requestId } : {}),
    },
  });
}
