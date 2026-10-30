import { escalateOverdueSafeguardingConcerns } from "@/modules/safeguarding/safeguarding-overdue.server";
import { markOverdueSubmissionsMissing } from "@/modules/learning/missing-work-service";
import { processSubscriptionReminders, processQueuedSubscriptionDeliveries, processWeeklyDigests, recoverSubscriptionEventMatches, escalateTerminalDeliveryFailures } from "@/platform/subscriptions";
import { expireOutstandingSectionOffers } from "@/modules/programs/section-lifecycle-service";
import { processPendingDomainEvents } from "./domain-event-worker";

/**
 * Existing periodic processor for restricted safeguarding handoffs and the outbox.
 * Overdue unacknowledged cases are routed before unrelated maintenance. GF1 depends on this running:
 * overdue submissions are marked missing (emitting AssignmentBecameMissing) and
 * pending domain events are dispatched to their handlers (guardian notifications).
 * GF-A2 adds subscription reminder processing ("remind me if it's still missing").
 */
export async function runScheduledJobs(): Promise<{
  safeguardingEscalated: number;
  safeguardingUnroutable: number;
  missing: number;
  processed: number;
  reminders: number;
  deliveries: number;
  digests: number;
  recovered: number;
  escalated: number;
  expiredSectionOffers: number;
}> {
  const safeguarding = await escalateOverdueSafeguardingConcerns();
  const missing = await markOverdueSubmissionsMissing();
  const processed = await processPendingDomainEvents();
  const recovered = await recoverSubscriptionEventMatches();
  const reminders = await processSubscriptionReminders();
  const deliveries = await processQueuedSubscriptionDeliveries();
  const escalated = await escalateTerminalDeliveryFailures();
  const digests = await processWeeklyDigests();
  const expiredSectionOffers = await expireOutstandingSectionOffers();
  return { safeguardingEscalated: safeguarding.escalatedCases, safeguardingUnroutable: safeguarding.unroutableCases, missing, processed, recovered, reminders, deliveries, digests, escalated, expiredSectionOffers };
}
