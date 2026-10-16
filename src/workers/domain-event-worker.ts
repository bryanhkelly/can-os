import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { handleAcademicInterventionEvent } from "@/modules/learning/gf1-event-handler";

export type DomainEventHandler = (eventId: string) => Promise<void>;

const registry = new Map<string, DomainEventHandler>();

/** Register the consumer for an event type. Events with no handler stay pending. */
export function registerDomainEventHandler(eventType: string, handler: DomainEventHandler): void {
  registry.set(eventType, handler);
}

registerDomainEventHandler(EventTypes.AssignmentBecameMissing, handleAcademicInterventionEvent);

/**
 * Outbox processor. Invoked by the scheduled jobs endpoint (see src/routes/api.jobs.ts
 * and netlify/functions/scheduled-jobs.ts) and by integration tests.
 */
export async function processPendingDomainEvents(limit = 100): Promise<number> {
  const handledTypes = [...registry.keys()];
  if (!handledTypes.length) return 0;
  // Only claim types with a registered handler: unhandled events must not
  // occupy the batch window and starve processable events behind them.
  const pending = await db
    .select({ id: domainEvents.id, eventType: domainEvents.eventType })
    .from(domainEvents)
    .where(and(eq(domainEvents.status, "pending"), inArray(domainEvents.eventType, handledTypes)))
    .orderBy(asc(domainEvents.occurredAt))
    .limit(limit);

  let processed = 0;

  for (const event of pending) {
    const handler = registry.get(event.eventType);
    if (!handler) continue;
    try {
      await handler(event.id);
      processed += 1;
    } catch (error) {
      await db
        .update(domainEvents)
        .set({
          status: "failed",
          attempts: sql`${domainEvents.attempts} + 1`,
          lastError: error instanceof Error ? error.message : "Unknown event error",
        })
        .where(eq(domainEvents.id, event.id));
    }
  }

  return processed;
}
