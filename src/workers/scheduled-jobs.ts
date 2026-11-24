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
  reportingReplayed: {enabled:boolean;processed:number;accepted:number;duplicate:number;legacy:number;retryPending:number;deadLettered:number;serviceFailed:boolean};
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
  // A reporting replay infrastructure problem must remain visible but must
  // never suppress unrelated safeguarding, learning or outbound maintenance.
  const reportingReplayed = reportingProjectionEnabled()
    ? await replayReportingSourceReceipts(50)
        .then(result => ({enabled:true,serviceFailed:false,...result}))
        .catch(() => {
          // Only the fixed failure category is logged. Never print raw
          // source payloads or database errors in scheduled-job output.
          console.error("reporting_projection_replay_unavailable");
          return {
            enabled:true,serviceFailed:true,processed:0,accepted:0,
            duplicate:0,legacy:0,retryPending:0,deadLettered:0,
          };
        })
    : {enabled:false,serviceFailed:false,processed:0,accepted:0,
        duplicate:0,legacy:0,retryPending:0,deadLettered:0};
  if (reportingReplayed.deadLettered > 0) {
    // Fixed category and aggregate count only. No source IDs or payload data.
    console.error("reporting_source_dead_lettered", {
      newDeadLetters: reportingReplayed.deadLettered,
    });
  }
  const classParticipantEmails = await processClassParticipantDeliveries();
  const recovered = await recoverSubscriptionEventMatches();
  const reminders = await processSubscriptionReminders();
  const deliveries = await processQueuedSubscriptionDeliveries();
  const escalated = await escalateTerminalDeliveryFailures();
  const digests = await processWeeklyDigests();
  const expiredSectionOffers = await expireOutstandingSectionOffers();
  // Campaign failures never block transactional or safeguarding work.
  await import("@/modules/communication/campaign-store.server")
    .then(m=>m.processEngagementCampaignDeliveries())
    .catch(()=>console.error("engagement_campaign_dispatch_unavailable"));
  await import("@/modules/geography/geographic-intelligence-store.server")
    .then(m=>m.processGeographicIntelligence())
    .catch(()=>console.error("geographic_intelligence_processing_unavailable"));
  const sessionDeviceRetention=await runSessionDeviceRetention();
  return { safeguardingEscalated: safeguarding.escalatedCases, safeguardingUnroutable: safeguarding.unroutableCases, missing, processed, reportingReplayed, recovered, reminders, deliveries, schoolFamilyDeliveries, noncreditWaitlistEmails, classParticipantEmails, digests, escalated, expiredSectionOffers, scheduledReminders, interestEventEmails, sessionDeviceRetention };
}
