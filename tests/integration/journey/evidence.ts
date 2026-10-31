/**
 * Journey evidence assertions — every consequential step in a golden-flow
 * journey must leave durable domain-event, audit and notification proof.
 * These helpers assert exactly-once evidence by default so retries and
 * double-writes fail the journey instead of passing silently.
 */
import { and, eq, type SQL } from "drizzle-orm";
import { expect } from "vitest";
import * as s from "@/db/schema";
import type { JourneyTx } from "./harness";

export async function expectJourneyDomainEvent(
  tx: JourneyTx,
  input: { aggregateId: string; eventType: string; aggregateType?: string; count?: number },
) {
  const conditions: SQL[] = [
    eq(s.domainEvents.aggregateId, input.aggregateId),
    eq(s.domainEvents.eventType, input.eventType),
  ];
  if (input.aggregateType) conditions.push(eq(s.domainEvents.aggregateType, input.aggregateType));
  const rows = await tx.select().from(s.domainEvents).where(and(...conditions));
  expect(rows, `domain event ${input.eventType} on ${input.aggregateId}`)
    .toHaveLength(input.count ?? 1);
  return rows;
}

export async function expectJourneyAudit(
  tx: JourneyTx,
  input: { resourceId: string; action: string; resourceType?: string; count?: number },
) {
  const conditions: SQL[] = [
    eq(s.auditEvents.resourceId, input.resourceId),
    eq(s.auditEvents.action, input.action),
  ];
  if (input.resourceType) conditions.push(eq(s.auditEvents.resourceType, input.resourceType));
  const rows = await tx.select().from(s.auditEvents).where(and(...conditions));
  expect(rows, `audit ${input.action} on ${input.resourceId}`).toHaveLength(input.count ?? 1);
  return rows;
}

export async function expectJourneyNotification(
  tx: JourneyTx,
  input: { recipientPersonId: string; type: string; resourceId?: string; count?: number },
) {
  const conditions: SQL[] = [
    eq(s.notifications.recipientPersonId, input.recipientPersonId),
    eq(s.notifications.type, input.type),
  ];
  if (input.resourceId) conditions.push(eq(s.notifications.resourceId, input.resourceId));
  const rows = await tx.select().from(s.notifications).where(and(...conditions));
  expect(rows, `notification ${input.type} for ${input.recipientPersonId}`)
    .toHaveLength(input.count ?? 1);
  return rows;
}

/** A scoped denial must reject; optionally match the canonical reason. */
export async function expectJourneyDenied(
  operation: Promise<unknown>,
  reason?: string,
) {
  if (reason) await expect(operation).rejects.toThrow(reason);
  else await expect(operation).rejects.toThrow();
}
