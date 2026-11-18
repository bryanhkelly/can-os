import { pgTable,text,timestamp,uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";

/** WS3 reviewed source-evidence intent; this is workflow state, NOT a second
 * completion or credential ledger. SQL owns immutable scope and forced RLS.
 */
export const learningCompletionEvidenceReviewRequests=pgTable("learning_completion_evidence_review_requests",{
    id:uuid("id").primaryKey().defaultRandom(),
    purpose:text("purpose").$type<
      "completion_correction"|"award_revocation"|"class_completion_decision"
    >().notNull(),
    noncreditRegistrationId:uuid("noncredit_registration_id"),
    expectedDecisionId:uuid("expected_decision_id"),
    approvedCorrectionOutcome:text("approved_correction_outcome")
      .$type<"not_yet_completed"|"voided">(),
    awardIssuanceId:uuid("award_issuance_id"),
    classEnrollmentId:uuid("class_enrollment_id"),
    expectedClassOutcomeId:uuid("expected_class_outcome_id"),
    approvedClassOutcome:text("approved_class_outcome")
      .$type<"completed"|"not_yet_completed"|"voided">(),
    evidenceVersionId:uuid("evidence_version_id").notNull(),
    participantPersonId:uuid("participant_person_id").notNull(),
    providerOrganizationId:uuid("provider_organization_id").notNull(),
    deliverySiteId:uuid("delivery_site_id").notNull(),
    submittedByPersonId:uuid("submitted_by_person_id").notNull(),
    reviewReason:text("review_reason").notNull(),
    status:text("status").$type<"pending"|"approved"|"rejected">().notNull().default("pending"),
    reviewedByPersonId:uuid("reviewed_by_person_id"),
    reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
    createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  });
