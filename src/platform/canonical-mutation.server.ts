import type { db } from "@/db/client";
import type { auditEvents as nativeAuditEvents, domainEvents as nativeDomainEvents } from "@/db/canonical-v301";
import { emitEvent, writeAudit } from "@/platform/mutation";

/**
 * Compatibility contract for native Class and noncredit callers.
 * This adapter routes its writes into the one authoritative public.audit_events and
 * public.domain_events journals through the shared platform writers.
 *
 * Native operation codes, organization attribution, payload, actor and
 * original event time are retained. No duplicate journal write, shadow table,
 * async side effect or independent transaction.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CanonicalAuditInput = Omit<typeof nativeAuditEvents.$inferInsert, "id">;
type CanonicalDomainEventInput = Omit<
  typeof nativeDomainEvents.$inferInsert,
  "id" | "status" | "attempts" | "lastError" | "nextAttemptAt" | "processedAt" | "createdAt"
>;

export async function writeCanonicalAudit(
  tx: Tx,
  entry: CanonicalAuditInput,
): Promise<void> {
  await writeAudit(tx, {
    actorPersonId: entry.actorPersonId ?? null,
    action: entry.eventCode,
    resourceType: entry.entityKind,
    resourceId: entry.entityId,
    scope: entry.owningOrganizationId
      ? { organizationId: entry.owningOrganizationId }
      : {},
    context: {
      source: "canonical_v301",
      nativeAuditPayload: entry.payload ?? {},
    },
    ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
  });
}

/** Atomically enqueue native domain facts in the existing shared public outbox. */
export async function emitCanonicalDomainEvent(
  tx: Tx,
  entry: CanonicalDomainEventInput,
): Promise<void> {
  await emitEvent(tx, {
    eventType: entry.eventType,
    aggregateType: entry.aggregateType,
    aggregateId: entry.aggregateId,
    actorPersonId: entry.actorPersonId ?? null,
    payload: entry.payload ?? {},
    ...(entry.occurredAt ? { occurredAt: entry.occurredAt } : {}),
  });
}
