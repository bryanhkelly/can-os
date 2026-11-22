import { escalateOverdueSafeguardingConcerns } from "@/modules/safeguarding/safeguarding-overdue.server";
import { markOverdueSubmissionsMissing } from "@/modules/learning/missing-work-service";
import { processSubscriptionReminders, processQueuedSubscriptionDeliveries, processWeeklyDigests, recoverSubscriptionEventMatches, escalateTerminalDeliveryFailures } from "@/platform/subscriptions";
import { expireOutstandingSectionOffers } from "@/modules/programs/section-lifecycle-service";
import { processSchoolFamilyOutboundDeliveries } from "@/modules/communication/school-family-alert-delivery.server";
import { processPendingDomainEvents } from "./domain-event-worker";
import { processScheduledReminders } from "./reminder-worker";
import { processInterestEventEmailDeliveries } from "./interest-event-email-worker";
import { processClassParticipantDeliveries } from "@/modules/classes/class-participant-delivery.server";
import {runSessionDeviceRetention} from "./session-device-retention";
import {processNoncreditWaitlistEmailDeliveries} from "@/modules/enrollment/noncredit-waitlist-delivery.server";
import { replayReportingSourceReceipts } from "@/modules/insights/reporting-source-receipts.server";
import { reportingProjectionEnabled } from "@/modules/insights/reporting-projection-rollout.server";

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
  reportingReplayed: {enabled:boolean;processed:number;accepted:number;duplicate:number;legacy:number};
  reminders: number;
  deliveries: number;
  schoolFamilyDeliveries: number;
  noncreditWaitlistEmails: { accepted:number; suppressed:number; failed:number };
  classParticipantEmails: { accepted:number; suppressed:number; failed:number };
  digests: number;
  recovered: number;
  escalated: number;
  expiredSectionOffers: number;
  scheduledReminders: { delivered: number; failed: number };
  interestEventEmails: { accepted: number; failed: number; cancelled: number };
  sessionDeviceRetention: boolean;
}> {
  const safeguarding = await escalateOverdueSafeguardingConcerns();
  const schoolFamilyDeliveries = await processSchoolFamilyOutboundDeliveries();
  const noncreditWaitlistEmails = await processNoncreditWaitlistEmailDeliveries();
  const scheduledReminders = await processScheduledReminders();
  const interestEventEmails = await processInterestEventEmailDeliveries();
  const missing = await markOverdueSubmissionsMissing();
  const processed = await processPendingDomainEvents(500);
  // Independently catch historical outbox events previously acknowledged by
  // pass-through consumers. Small batches keep maintenance bounded.
  const reportingReplayed = reportingProjectionEnabled()
    ? {enabled:true, ...await replayReportingSourceReceipts(50)}
    : {enabled:false, processed:0, accepted:0, duplicate:0, legacy:0};
  const classParticipantEmails = await processClassParticipantDeliveries();
  const recovered = await recoverSubscriptionEventMatches();
  const reminders = await processSubscriptionReminders();
  const deliveries = await processQueuedSubscriptionDeliveries();
  const escalated = await escalateTerminalDeliveryFailures();
  const digests = await processWeeklyDigests();
  const expiredSectionOffers = await expireOutstandingSectionOffers();
  const sessionDeviceRetention=await runSessionDeviceRetention();
  return { safeguardingEscalated: safeguarding.escalatedCases, safeguardingUnroutable: safeguarding.unroutableCases, missing, processed, reportingReplayed, recovered, reminders, deliveries, schoolFamilyDeliveries, noncreditWaitlistEmails, classParticipantEmails, digests, escalated, expiredSectionOffers, scheduledReminders, interestEventEmails, sessionDeviceRetention };
}
