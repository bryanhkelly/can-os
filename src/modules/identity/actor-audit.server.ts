import {writeAudit,type MutationTx} from "@/platform/mutation";
import type {Actor} from "./actors.server";

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
