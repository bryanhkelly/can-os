import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { domainEvents } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { handleAcademicInterventionEvent } from "@/modules/learning/gf1-event-handler";

export async function processPendingDomainEvents(limit = 100): Promise<number> {
  const pending = await db
    .select({ id: domainEvents.id, eventType: domainEvents.eventType })
    .from(domainEvents)
    .where(eq(domainEvents.status, "pending"))
    .orderBy(asc(domainEvents.occurredAt))
    .limit(limit);

  let processed = 0;

  for (const event of pending) {
    try {
      switch (event.eventType) {
        case EventTypes.AssignmentBecameMissing:
          await handleAcademicInterventionEvent(event.id);
          break;
        default:
          await db
            .update(domainEvents)
            .set({ status: "processed", processedAt: new Date() })
            .where(eq(domainEvents.id, event.id));
      }
      processed += 1;
    } catch (error) {
      await db
        .update(domainEvents)
        .set({
          status: "failed",
          lastError: error instanceof Error ? error.message : "Unknown event error",
        })
        .where(eq(domainEvents.id, event.id));
    }
  }

  return processed;
}
