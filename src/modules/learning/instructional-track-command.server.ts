import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { auditEvents } from "@/db/schema";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import type { TrackTx } from "./instructional-track-access.server";

function fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item) && !(item instanceof Date)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item)).digest("hex");
}

/** Authorization is rechecked by the caller before replay. One actor/request namespace
 * across every track command prevents a key being reused for a different operation.
 * Persist only a fingerprint and safe result; never put private answers into audit/outbox.
 */
export async function trackCommand<T extends Record<string, unknown>>(tx: TrackTx, actor: Actor, input: {
  requestId: string; action: string; eventType: string; entityType: string; entityId: string;
  scope: { programId: string; organizationId: string; siteId?: string | null; sectionId?: string };
  payload: unknown;
}, apply: () => Promise<T>): Promise<T> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"instructional-command:" + actor.actorPersonId + ":" + input.requestId}))`);
  const digest = fingerprint({ action: input.action, payload: input.payload });
  const [prior] = await tx.select({ after: auditEvents.after }).from(auditEvents).where(and(
    eq(auditEvents.actorPersonId, actor.actorPersonId),
    sql`${auditEvents.context}->>'instructionalRequestId' = ${input.requestId}`,
  )).limit(1);
  if (prior) {
    if (prior.after?.inputHash !== digest || !prior.after?.result) throw new Error("This request ID was already used for different input.");
    return prior.after.result as T;
  }
  const result = await apply();
  await writeAudit(tx, actor, { action: input.action, entityType: input.entityType, entityId: input.entityId,
    scope: input.scope, after: { inputHash: digest, result }, contextExtras: { instructionalRequestId: input.requestId } });
  await emitEvent(tx, { eventType: input.eventType, aggregateType: input.entityType, aggregateId: input.entityId,
    actorPersonId: actor.actorPersonId, ...input.scope, payload: { requestId: input.requestId } });
  return result;
}
