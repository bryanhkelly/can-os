import { markOverdueSubmissionsMissing } from "@/modules/learning/missing-work-service";
import { processSubscriptionReminders, processQueuedSubscriptionDeliveries, processWeeklyDigests } from "@/platform/subscriptions";
import { processPendingDomainEvents } from "./domain-event-worker";

/**
 * Periodic maintenance for the transactional outbox. GF1 depends on this running:
 * overdue submissions are marked missing (emitting AssignmentBecameMissing) and
 * pending domain events are dispatched to their handlers (guardian notifications).
 * GF-A2 adds subscription reminder processing ("remind me if it's still missing").
 */
export async function runScheduledJobs(): Promise<{
  missing: number;
  processed: number;
  reminders: number;
  deliveries: number;
  digests: number;
}> {
  const missing = await markOverdueSubmissionsMissing();
  const processed = await processPendingDomainEvents();
  const reminders = await processSubscriptionReminders();
  const deliveries = await processQueuedSubscriptionDeliveries();
  const digests = await processWeeklyDigests();
  return { missing, processed, reminders, deliveries, digests };
}
