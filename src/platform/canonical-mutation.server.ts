import type { db } from "@/db/client";
import { auditEvents, domainEvents } from "@/db/canonical-v301";

/**
 * Canonical education_v30 mutation evidence writers.
 *
 * Keep these separate from the legacy public-schema writers in platform/mutation:
 * the canonical audit table has a different column contract. Callers own
 * domain eligibility and must invoke both writers in their existing business
 * transaction, never in a post-commit task.
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type CanonicalAuditInput = typeof auditEvents.$inferInsert;
type CanonicalDomainEventInput = typeof domainEvents.$inferInsert;

export async function writeCanonicalAudit(
  tx: Tx,
  entry: CanonicalAuditInput,
): Promise<void> {
  await tx.insert(auditEvents).values(entry);
}

/** A durable pending event, atomically committed with its domain mutation. */
export async function emitCanonicalDomainEvent(
  tx: Tx,
  entry: CanonicalDomainEventInput,
): Promise<void> {
  await tx.insert(domainEvents).values(entry);
}
