import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db/client";
import { actions, domainEvents } from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import { handleAcademicInterventionEvent } from "@/modules/learning/missing-assignment-event-handler";
import {
  handleAcademicPassThroughEvent,
  handleGradePostedEvent,
  handleSubmissionReceivedEvent,
} from "@/modules/learning/academic-event-handler";
import { handleNotificationPolicyEvent } from "@/platform/notifications/policy-handler";
import { processEventSubscriptions } from "@/platform/subscriptions";
import { handleFamilyInvitationBatch } from "@/modules/enrollment/family-invitations.server";

export type DomainEventHandler = (eventId: string) => Promise<void>;

const registry = new Map<string, DomainEventHandler>();

/** Register the consumer for an event type. Events with no handler stay pending. */
export function registerDomainEventHandler(eventType: string, handler: DomainEventHandler): void {
  registry.set(eventType, handler);
}

registerDomainEventHandler(EventTypes.AssessmentPublished, handleAcademicPassThroughEvent);
registerDomainEventHandler(EventTypes.AssignmentBecameMissing, handleAcademicInterventionEvent);
registerDomainEventHandler(EventTypes.SubmissionReceived, handleSubmissionReceivedEvent);
registerDomainEventHandler(EventTypes.GradePosted, handleGradePostedEvent);
registerDomainEventHandler(EventTypes.FamilyInvitationBatchRequested, handleFamilyInvitationBatch);
registerDomainEventHandler(EventTypes.CommunicationMessageSent, handleNotificationPolicyEvent);
registerDomainEventHandler(EventTypes.ClassAnnouncementPublished, handleNotificationPolicyEvent);
registerDomainEventHandler(EventTypes.AdmissionsStageChanged, handleNotificationPolicyEvent);
registerDomainEventHandler(EventTypes.ActionCreated, handleAcademicPassThroughEvent);
registerDomainEventHandler(EventTypes.ActionResolved, handleAcademicPassThroughEvent);
registerDomainEventHandler(EventTypes.InsightCreated, handleAcademicPassThroughEvent);

// Lifecycle facts already have transactional evidence. Pass through to shared
// subscriptions and complete the outbox; delivery depends on registered consumers.
for (const eventType of [
  EventTypes.ApplicationStarted,
  EventTypes.ApplicationAccepted,
  EventTypes.AdmissionOfferIssued,
  EventTypes.AdmissionOfferAccepted,
  EventTypes.AdmissionOfferDeclined,
  EventTypes.AdmissionOfferExpired,
  EventTypes.EnrollmentActivated,
  EventTypes.EnrollmentExited,
  EventTypes.SubmissionGradingDraftSaved,
  EventTypes.FieldTripPermissionDeclined,
  EventTypes.ExtendedLearningEvidenceSubmitted,
  EventTypes.ExtendedLearningEvidenceReviewed,
  EventTypes.ProgramLaunchStarted,
  EventTypes.ProgramActivated,
  EventTypes.ChurchSchoolOpeningApproved,
  EventTypes.ChurchSchoolOpeningSuspended,
  EventTypes.ChurchSchoolOpeningEvidenceSubmitted,
  EventTypes.ChurchSchoolOpeningEvidenceReviewed,
  EventTypes.OnsiteAdultPresenceReported,
  EventTypes.OnsiteBlockPresenceWitnessed,
  EventTypes.CANAcademicProgramStaffDelegated,
  EventTypes.CANAcademicProgramStaffRevoked,
  EventTypes.SectionCreditConfigured,
  EventTypes.ActionDeadlineChanged,
  EventTypes.SiteCreated,
  EventTypes.SchoolYearCreated,
  EventTypes.SchoolYearActivated,
  EventTypes.AcademicCalendarChanged,
  EventTypes.ScheduleTemplateChanged,
  EventTypes.StudentMarkedAbsent,
  EventTypes.AttendanceCorrected,
  EventTypes.AttendanceExcuseSubmitted,
  EventTypes.AttendanceExcuseApproved,
  EventTypes.AttendanceExcuseRejected,
  EventTypes.LessonCompletionChanged,
  EventTypes.SubmissionAnnotated,
  EventTypes.ProfilePhotoChanged,
  EventTypes.SupportReferralAdvanced,
  EventTypes.SupportPlanSaved,
  EventTypes.SupportServiceScheduled,
  EventTypes.SupportServiceCompleted,
  EventTypes.CourseDiscussionCreated,
  EventTypes.CourseDiscussionMessagePosted,
  EventTypes.CourseDiscussionLockChanged,
  EventTypes.CourseDiscussionMessageModerated,
  EventTypes.AdmissionOfferRevoked,
  EventTypes.JourneyRequirementCompleted,
  EventTypes.JourneyRequirementStatusChanged,
  EventTypes.JourneyReady,
  EventTypes.CurriculumCourseCreated,
  EventTypes.CurriculumDraftCreated,
  EventTypes.CurriculumDraftSaved,
  EventTypes.CurriculumPublished,
  EventTypes.TranscriptIssued,
  EventTypes.StudentLearningGoalReviewed,
  EventTypes.EnrollmentDocumentSubmitted,
  EventTypes.EnrollmentDocumentReviewed,
  EventTypes.EnrollmentFormSigned,
  EventTypes.EnrollmentFormReviewed,
  EventTypes.NetworkAgreementVerified,
  EventTypes.NetworkAdministratorProvisioned,
  EventTypes.SiteAffiliationRequested,
  EventTypes.SiteAffiliationApproved,
  EventTypes.SiteAffiliationRejected,
  EventTypes.SiteAffiliationRevoked,
  EventTypes.CalendarEventCreated,
  EventTypes.CalendarEventUpdated,
  EventTypes.CalendarEventRescheduled,
  EventTypes.CalendarEventCancelled,
  EventTypes.AttendanceExcuseWithdrawn,
  EventTypes.PickupAuthorizationCreated,
  EventTypes.PickupAuthorizationRevoked,
  EventTypes.PickupCustodyHoldCreated,
  EventTypes.PickupCustodyHoldResolved,
  EventTypes.ChildReleaseVerified,
  EventTypes.ChildPickupDenied,
  EventTypes.ChildUncollectedFollowUpCreated,
  EventTypes.OnsiteRoomPlanSubmitted,
  EventTypes.OnsiteRoomPlanReviewed,
  EventTypes.IncidentFiled,
  EventTypes.IncidentAmended,
  EventTypes.IncidentReviewCompleted,
  EventTypes.IncidentNotificationQueued,
  EventTypes.IncidentClosed,
  EventTypes.SafeguardingSiteConfigurationSaved,
  EventTypes.SafeguardingConcernFiled,
  EventTypes.SafeguardingConcernAcknowledged,
  EventTypes.SafeguardingConcernEscalated,
  EventTypes.SafeguardingCaseReviewCompleted,
  EventTypes.SafeguardingCaseReviewAssigned,
  EventTypes.SafeguardingEvidenceAdded,
  EventTypes.SafeguardingExternalReportRecorded,
  EventTypes.HealthComplianceUpdated,
  EventTypes.MedicationAdministered,
  EventTypes.StudentSentHomeIll,
  EventTypes.ReturnToSchoolCleared,
  EventTypes.FieldTripProposed,
  EventTypes.FieldTripApproved,
  EventTypes.FieldTripStudentInvited,
  EventTypes.FieldTripPermissionSigned,
  EventTypes.FieldTripAttendanceRecorded,
  EventTypes.FieldTripChaperoneAssigned,
  EventTypes.FieldTripIncidentLinked,
  EventTypes.ActivityCreated,
  EventTypes.ActivitySeasonCreated,
  EventTypes.ActivityRegistrationCreated,
  EventTypes.ActivityRegistrationWithdrawn,
  EventTypes.ActivityEligibilityChecked,
  EventTypes.ConferenceSeriesCreated,
  EventTypes.ConferenceReminderQueued,
  EventTypes.ConferenceBooked,
  EventTypes.ConferenceRescheduled,
  EventTypes.ConferenceCancelled,
  EventTypes.ConferenceHeld,
  EventTypes.ConferenceNoShowRecorded,
  EventTypes.InstructionalCapacityReserved,
  EventTypes.InstructionalCapacityReleased,
  EventTypes.InstructorCapacityReplaced,
  EventTypes.DeliveryArrangementCreated,
  EventTypes.DeliveryArrangementActivated,
  EventTypes.GradingPeriodCreated,
  EventTypes.TermCreated,
  EventTypes.AdmissionsInquiryCreated,
  EventTypes.PublicAdmissionsInterestReceived,
  EventTypes.PublicAdmissionsInterestStatusChanged,
  EventTypes.PublicAdmissionsInterestConverted,
  EventTypes.PublicFamilyStartRequested,
  EventTypes.PublicFamilyStartVerified,
  EventTypes.FamilyInvitationRecipientStatusChanged,
  EventTypes.FamilyInvitationBatchCompleted,
  EventTypes.StudentLearningAccessApproved,
  EventTypes.SectionProvisioned,
  EventTypes.SectionScheduleChanged,
  EventTypes.SectionClosed,
  EventTypes.SectionReopened,
  EventTypes.SectionTeacherReplaced,
  EventTypes.SectionEnrollmentChanged,
  EventTypes.SectionEnrollmentActivated,
  EventTypes.SectionEnrollmentDropped,
  EventTypes.SectionEnrollmentWithdrawn,
  EventTypes.SectionStudentTransferred,
  EventTypes.SectionWaitlistAdded,
  EventTypes.SectionWaitlistResolved,
  EventTypes.SectionWaitlistPromoted,
  EventTypes.SectionWaitlistSeatOffered,
  EventTypes.SectionWaitlistOfferExpired,
  EventTypes.SectionFacilitatorAppointed,
  EventTypes.SectionFacilitatorRevoked,
  EventTypes.CourseRegistrationRequested,
  EventTypes.CourseRegistrationDecided,
  EventTypes.CourseRegistrationGuardianDecision,
  EventTypes.CourseRegistrationPolicyChanged,
  EventTypes.CurriculumCartridgeValidated,
  EventTypes.CurriculumSupplementAdded,
  EventTypes.CurriculumSupplementChanged,
  EventTypes.CurriculumPackInstalled,
  EventTypes.CurriculumPackAdopted,
  EventTypes.CurriculumPublisherPackCreated,
  EventTypes.CurriculumPublisherPackDraftCreated,
  EventTypes.CurriculumPublisherPackDraftSaved,
  EventTypes.CurriculumPublisherPackPublished,
  EventTypes.OneRosterCsvValidated,
  EventTypes.OneRosterRosterExported,
  EventTypes.AcademicProgramMarketingPublished,
  EventTypes.AcademicProgramMarketingUnpublished,
  EventTypes.ProgramSiteAuthorizationRequested,
  EventTypes.ProgramSiteAuthorizationApproved,
  EventTypes.ProgramSiteAuthorizationDenied,
  EventTypes.ProgramSiteAuthorizationRevoked,
  EventTypes.ProgramOpeningHandoffCreated,
  EventTypes.ProgramOpeningHandoffTransferred,
  EventTypes.ProgramOpeningHandoffAcknowledged,
  EventTypes.TeacherQualificationPolicyPublished,
  EventTypes.TeacherQualificationPolicyRevised,
  EventTypes.LocalSiteResponsibilityAppointed,
  EventTypes.LocalSiteResponsibilityRevoked,
  EventTypes.SitePublicAddressReserved,
  EventTypes.SitePublished,
  EventTypes.SiteUnpublished,
  EventTypes.SiteLocalWebsiteContentPublished,
  EventTypes.SiteLocalWebsiteContentReviewRequested,
  EventTypes.QualificationDefinitionCreated,
  EventTypes.QualificationClaimCreated,
  EventTypes.QualificationVerificationDecided,
  EventTypes.StaffInvitationIssued,
  EventTypes.StaffInvitationAccepted,
  EventTypes.EnrichmentChildProfileCreated,
  EventTypes.ExtendedLearningRegistrationPublished,
  EventTypes.StudyGroupCreated,
  EventTypes.StudyGroupMembershipRequested,
  EventTypes.StudyGroupMembershipDecided,
  EventTypes.StudyGroupGuardianConsentDecided,
  EventTypes.StudyGroupPostCreated,
  EventTypes.StudyGroupPostReported,
  EventTypes.StudyGroupReportResolved,
  EventTypes.StudyGroupSessionCreated,
  EventTypes.StudyGroupSessionRescheduled,
  EventTypes.StudyGroupSessionCancelled,
  EventTypes.DemoRegistrarProvisioned,
  EventTypes.DemoFacilitatorProvisioned,
  // Access and authorization lifecycle facts: audit evidence is already written
  // transactionally; these only complete the outbox for shared subscriptions.
  EventTypes.AccessAccountDisabled,
  EventTypes.GuardianAccessRevoked,
  EventTypes.GuardianAccessRestored,
  EventTypes.StudentLearningAccessRevoked,
  EventTypes.StudentLearningAccessRestored,
  EventTypes.ProgramSiteAuthorizationSuspended,
  EventTypes.ProgramSiteAuthorizationResumed,
  EventTypes.ProgramSiteAuthorizationRenewed,
  EventTypes.OperatingAgreementEvidenceRegistered,
] as const) {
  registerDomainEventHandler(eventType, handleAcademicPassThroughEvent);
}

/** Bounded retry: after this many failed attempts an event escalates to an ops Action. */
const MAX_ATTEMPTS = 5;
/** Lease on a claimed event. A crashed worker's claims become reclaimable after this. */
const LEASE_MS = 10 * 60_000;

function backoffMs(attempts: number): number {
  return Math.min(30_000 * 2 ** attempts, 30 * 60_000);
}

type ClaimedEvent = { id: string; eventType: string };

/**
 * Claim a batch of due, pending events by marking them processing with a
 * lease. FOR UPDATE SKIP LOCKED lets concurrent workers claim disjoint
 * batches without double-processing.
 */
async function claimBatch(handledTypes: string[], limit: number): Promise<ClaimedEvent[]> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const claimed = await tx
      .select({ id: domainEvents.id, eventType: domainEvents.eventType })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.status, "pending"),
          inArray(domainEvents.eventType, handledTypes),
          or(isNull(domainEvents.nextAttemptAt), lte(domainEvents.nextAttemptAt, now)),
        ),
      )
      .orderBy(asc(domainEvents.occurredAt))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (!claimed.length) return [];

    await tx
      .update(domainEvents)
      .set({ status: "processing", nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
      .where(
        inArray(
          domainEvents.id,
          claimed.map((row) => row.id),
        ),
      );

    return claimed;
  });
}

/** Reclaim events whose worker crashed mid-processing (lease expired). */
async function reclaimStaleClaims(): Promise<void> {
  await db
    .update(domainEvents)
    .set({ status: "pending", nextAttemptAt: null })
    .where(and(eq(domainEvents.status, "processing"), lte(domainEvents.nextAttemptAt, new Date())));
}

async function markSucceeded(eventId: string): Promise<void> {
  // Handlers normally mark their own event processed inside their
  // transaction; this covers handlers that return without doing so.
  await db
    .update(domainEvents)
    .set({ status: "processed", processedAt: new Date(), nextAttemptAt: null })
    .where(and(eq(domainEvents.id, eventId), eq(domainEvents.status, "processing")));
}

async function markFailed(eventId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown event error";

  await db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(domainEvents)
      .where(eq(domainEvents.id, eventId))
      .limit(1);
    // Only failures while the event is leased to this worker may reset it.
    // If the handler already committed the event as processed and a later
    // step (subscription fan-out) threw, requeueing would re-run the handler
    // and duplicate its side effects (insights, notifications, emails).
    // Subscription-level recovery is owned by recoverSubscriptionEventMatches.
    if (!event || event.status !== "processing") return;

    const attempts = event.attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      await tx
        .update(domainEvents)
        .set({ status: "failed", attempts, lastError: message, nextAttemptAt: null })
        .where(eq(domainEvents.id, eventId));

      // Terminal failure must never be a silent drop: escalate to an ops
      // Action. This is an infrastructure signal, not a business mutation,
      // so it deliberately does not emit a domain event of its own.
      const scope = event.payload as Record<string, unknown>;
      await tx.insert(actions).values({
        type: "outbox_event_failed",
        status: "open",
        priority: "high",
        title: `Domain event ${event.eventType} failed after ${attempts} attempts`,
        description: message,
        organizationId: typeof scope.organizationId === "string" ? scope.organizationId : null,
        siteId: typeof scope.siteId === "string" ? scope.siteId : null,
        programId: typeof scope.programId === "string" ? scope.programId : null,
        sectionId: typeof scope.sectionId === "string" ? scope.sectionId : null,
        subjectType: "domain_event",
        subjectId: event.id,
      });
      return;
    }

    await tx
      .update(domainEvents)
      .set({
        status: "pending",
        attempts,
        lastError: message,
        nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
      })
      .where(eq(domainEvents.id, eventId));
  });
}

/**
 * Outbox processor. Invoked by the scheduled jobs endpoint (see src/routes/api.jobs.ts
 * and netlify/functions/scheduled-jobs.ts) and by integration tests.
 */
export async function processPendingDomainEvents(limit = 100): Promise<number> {
  const handledTypes = [...registry.keys()];
  if (!handledTypes.length) return 0;

  await reclaimStaleClaims();
  const claimed = await claimBatch(handledTypes, limit);

  let processed = 0;

  for (const event of claimed) {
    const handler = registry.get(event.eventType);
    try {
      if (handler) await handler(event.id);
      await markSucceeded(event.id);
      await processEventSubscriptions(event.id);
      processed += 1;
    } catch (error) {
      await markFailed(event.id, error);
    }
  }

  return processed;
}

export type OutboxHealth = {
  /** Events terminally failed; each has an escalation Action. */
  failed: number;
  /** Events waiting for a worker claim. */
  pending: number;
  /** Pending events whose type has no registered handler — observable, not silently parked. */
  pendingUnhandled: number;
  /** Events currently leased by a worker. */
  processing: number;
};

/** Operational view of the outbox for monitoring surfaces and alerts. */
export async function getOutboxHealth(): Promise<OutboxHealth> {
  const handledTypes = [...registry.keys()];

  const countWhere = async (where: SQL | undefined): Promise<number> => {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domainEvents)
      .where(where);
    return Number(row?.count ?? 0);
  };

  const [failed, pending, pendingUnhandled, processing] = await Promise.all([
    countWhere(eq(domainEvents.status, "failed")),
    countWhere(eq(domainEvents.status, "pending")),
    countWhere(
      and(
        eq(domainEvents.status, "pending"),
        handledTypes.length
          ? notInArray(domainEvents.eventType, handledTypes)
          : undefined,
      ),
    ),
    countWhere(eq(domainEvents.status, "processing")),
  ]);

  return { failed, pending, pendingUnhandled, processing };
}
