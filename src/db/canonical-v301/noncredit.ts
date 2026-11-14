import { boolean, integer, numeric, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
const id = () => uuid("id").defaultRandom().primaryKey();

/** SQL v3.0.1 remains authoritative for evidence, decisions and publication. */
export const noncreditParticipationEvents = educationV30.table("noncredit_participation_events",{
  id:id(),registrationId:uuid("registration_id").notNull(),
  eventKind:text("event_kind").$type<"lesson_completed"|"session_attended"|"skill_practiced"|"activity_completed"|"attendance_corrected">().notNull(),
  occurredAt:timestamp("occurred_at",{withTimezone:true}).notNull(),
  countedMinutes:integer("counted_minutes").notNull(),
  evidenceVersionId:uuid("evidence_version_id"),recordedByPersonId:uuid("recorded_by_person_id").notNull(),
  supersedesId:uuid("supersedes_id"),
});
export const noncreditCompletionPolicies = educationV30.table("noncredit_completion_policies",{
  id:id(),trainingVersionId:uuid("training_version_id").notNull(),
  policyVersion:integer("policy_version").notNull(),
  minParticipationMinutes:integer("min_participation_minutes").notNull(),
  requireAllLessons:boolean("require_all_lessons").notNull().default(false),
  skillsAssessmentRequired:boolean("skills_assessment_required").notNull(),
  minimumAssessmentFraction:numeric("minimum_assessment_fraction",{precision:6,scale:5}),
  effectiveAt:timestamp("effective_at",{withTimezone:true}).notNull(),
  approvedByPersonId:uuid("approved_by_person_id").notNull(),
  publishedAt:timestamp("published_at",{withTimezone:true}).notNull(),
});
export const noncreditCompletionDecisions = educationV30.table("noncredit_completion_decisions",{
  id:id(),registrationId:uuid("registration_id").notNull(),
  policyId:uuid("policy_id").notNull(),assessmentResultId:uuid("assessment_result_id"),
  outcome:text("outcome").$type<"completed"|"not_yet_completed"|"voided">().notNull(),
  decidedByPersonId:uuid("decided_by_person_id").notNull(),
  decidedAt:timestamp("decided_at",{withTimezone:true}).notNull().defaultNow(),
  evidenceVersionId:uuid("evidence_version_id"),supersedesId:uuid("supersedes_id"),
});
export const assessmentAdministrations = educationV30.table("assessment_administrations",{
  id:id(),assessmentVersionId:uuid("assessment_version_id").notNull(),
  deploymentId:uuid("deployment_id"),courseVersionId:uuid("course_version_id"),
});
export const assessmentAccessGrants = educationV30.table("assessment_access_grants",{
  id:id(),administrationId:uuid("administration_id").notNull(),
  learnerId:uuid("learner_id").notNull(),courseAttemptId:uuid("course_attempt_id"),
  accessStatus:text("access_status").notNull(),
});
export const assessmentAttempts = educationV30.table("assessment_attempts",{
  id:id(),administrationId:uuid("administration_id").notNull(),
  accessGrantId:uuid("access_grant_id").notNull(),learnerId:uuid("learner_id").notNull(),
});
export const assessmentAttemptResults = educationV30.table("assessment_attempt_results",{
  id:id(),attemptId:uuid("attempt_id").notNull(),
  resultRevision:integer("result_revision").notNull(),
  resultStatus:text("result_status").$type<"provisional"|"reviewed"|"finalized"|"voided">().notNull(),
  pointsEarned:numeric("points_earned",{precision:12,scale:4}).notNull(),
  pointsPossible:numeric("points_possible",{precision:12,scale:4}).notNull(),
  calculatedAt:timestamp("calculated_at",{withTimezone:true}).notNull(),
  supersedesId:uuid("supersedes_id"),
});

/** Existing canonical v3.0.1 certificate issuance, not a second award ledger. */
export const noncreditCompletionCertificates = educationV30.table("noncredit_completion_certificates", {
  id: id(), decisionId: uuid("decision_id").notNull(),
  issuerOrganizationId: uuid("issuer_organization_id").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  issuedByPersonId: uuid("issued_by_person_id").notNull(),
  certificateReference: text("certificate_reference").notNull(),
  status: text("status").$type<"issued" | "revoked">().notNull().default("issued"),
  revocationEvidenceId: uuid("revocation_evidence_id"),
});
