import { escalateOverdueSafeguardingConcerns } from "@/modules/safeguarding/safeguarding-overdue.server";
import { markOverdueSubmissionsMissing } from "@/modules/learning/missing-work-service";
import { processSubscriptionReminders, processQueuedSubscriptionDeliveries, processWeeklyDigests, recoverSubscriptionEventMatches, escalateTerminalDeliveryFailures } from "@/platform/subscriptions";
import { expireOutstandingSectionOffers } from "@/modules/programs/section-lifecycle-service";
import { processSchoolFamilyOutboundDeliveries } from "@/modules/communication/school-family-alert-delivery.server";
import { processPendingDomainEvents } from "./domain-event-worker";
import { processScheduledReminders } from "./reminder-worker";
import { processInterestEventEmailDeliveries } from "./interest-event-email-worker";

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
  schoolFamilyDeliveries: number;
  digests: number;
  recovered: number;
  escalated: number;
  expiredSectionOffers: number;
  scheduledReminders: { delivered: number; failed: number };
  interestEventEmails: { accepted: number; failed: number; cancelled: number };
}> {
  const safeguarding = await escalateOverdueSafeguardingConcerns();
  const schoolFamilyDeliveries = await processSchoolFamilyOutboundDeliveries();
  const scheduledReminders = await processScheduledReminders();
  const interestEventEmails = await processInterestEventEmailDeliveries();
  const missing = await markOverdueSubmissionsMissing();
  const processed = await processPendingDomainEvents(500);
  const recovered = await recoverSubscriptionEventMatches();
  const reminders = await processSubscriptionReminders();
  const deliveries = await processQueuedSubscriptionDeliveries();
  const escalated = await escalateTerminalDeliveryFailures();
  const digests = await processWeeklyDigests();
  const expiredSectionOffers = await expireOutstandingSectionOffers();
  return { safeguardingEscalated: safeguarding.escalatedCases, safeguardingUnroutable: safeguarding.unroutableCases, missing, processed, recovered, reminders, deliveries, schoolFamilyDeliveries, digests, escalated, expiredSectionOffers, scheduledReminders, interestEventEmails };
}
