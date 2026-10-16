import { markOverdueSubmissionsMissing } from "@/modules/learning/missing-work-service";
import { processPendingDomainEvents } from "./domain-event-worker";

/**
 * Periodic maintenance for the transactional outbox. GF1 depends on this running:
 * overdue submissions are marked missing (emitting AssignmentBecameMissing) and
 * pending domain events are dispatched to their handlers (guardian notifications).
 */
export async function runScheduledJobs(): Promise<{ missing: number; processed: number }> {
  const missing = await markOverdueSubmissionsMissing();
  const processed = await processPendingDomainEvents();
  return { missing, processed };
}
