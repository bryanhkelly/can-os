import { and, eq, sql } from "drizzle-orm";
import { expect, vi } from "vitest";
import type { Database } from "@/db/client";
import { auditEvents, domainEvents } from "@/db/schema";
import * as mutation from "@/platform/mutation";

export async function expectMutationEvidence(db: Database, input: {
  resourceType: string;
  resourceId: string;
  action: string;
  eventType: string;
  actorPersonId: string;
  requestId: string;
  scope: Record<string, unknown>;
  aggregateType?: string;
  aggregateId?: string;
}) {
  const audits = await db.select().from(auditEvents).where(and(
    eq(auditEvents.resourceType, input.resourceType),
    eq(auditEvents.resourceId, input.resourceId),
    eq(auditEvents.action, input.action),
  ));
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({
    actorPersonId: input.actorPersonId,
    context: { requestId: input.requestId },
    scope: input.scope,
  });
  const events = await db.select().from(domainEvents).where(and(
    eq(domainEvents.aggregateType, input.aggregateType ?? input.resourceType),
    eq(domainEvents.aggregateId, input.aggregateId ?? input.resourceId),
    eq(domainEvents.eventType, input.eventType),
  ));
  expect(events).toHaveLength(1);
  expect(events[0]?.actorPersonId).toBe(input.actorPersonId);
  return { audit: audits[0]!, event: events[0]! };
}

export async function expectEvidenceFailure(
  db: Database,
  writer: "writeAudit" | "emitEvent",
  operation: () => Promise<unknown>,
) {
  const evidenceCounts = async () => {
    const result = await db.execute<{ audits: number; events: number }>(sql`
      SELECT (SELECT count(*)::int FROM ${auditEvents}) AS audits,
        (SELECT count(*)::int FROM ${domainEvents}) AS events
    `);
    return result.rows[0];
  };
  const before = await evidenceCounts();
  const failure = new Error(`Injected ${writer} failure`);
  const spy = vi.spyOn(mutation, writer).mockRejectedValueOnce(failure);
  try {
    await expect(operation()).rejects.toBe(failure);
  } finally {
    spy.mockRestore();
  }
  expect(await evidenceCounts()).toEqual(before);
}
