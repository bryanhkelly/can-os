import {
  bigint, boolean, customType, integer, jsonb, numeric, text, timestamp, uuid,
} from "drizzle-orm/pg-core";
import { educationV30 } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();
const bytea = customType<{data:Buffer;driverData:Buffer}>({
  dataType: () => "bytea",
});

/**
 * This is a typed projection of existing canonical SQL, not a parallel
 * assessment schema. The SQL release/eligibility/scoring triggers own
 * the business invariants and PostgreSQL RLS remains mandatory.
 */
export const assessmentDefinitions = educationV30.table("assessment_definitions", {
  id:id(),ownerOrganizationId:uuid("owner_organization_id").notNull(),
  assessmentKey:text("assessment_key").notNull(),title:text("title").notNull(),
  purpose:text("purpose").$type<"official"|"diagnostic"|"placement"|"readiness"|"foundation"|
    "formative"|"mastery"|"credential"|"practice">().notNull(),
});
export const assessmentVersions = educationV30.table("assessment_versions",{
  id:id(),assessmentId:uuid("assessment_id").notNull(),
  courseVersionId:uuid("course_version_id"),
  lifecycle:text("lifecycle").$type<"draft"|"published">().notNull(),
});
export const assessmentFormVersions = educationV30.table("assessment_form_versions",{
  id:id(),assessmentVersionId:uuid("assessment_version_id").notNull(),
  lifecycle:text("lifecycle").$type<"draft"|"published">().notNull(),
  shuffleQuestions:boolean("shuffle_questions").notNull(),
  passingFraction:numeric("passing_fraction",{precision:6,scale:5}),
});
export const assessmentFormSections = educationV30.table("assessment_form_sections",{
  id:id(),formVersionId:uuid("form_version_id").notNull(),
  ordinal:integer("ordinal").notNull(),
  selectionMode:text("selection_mode").$type<"fixed"|"random_pool">().notNull(),
  shuffleWithinSection:boolean("shuffle_within_section").notNull(),
});
export const assessmentFormItems = educationV30.table("assessment_form_items",{
  id:id(),formVersionId:uuid("form_version_id").notNull(),
  formSectionId:uuid("form_section_id").notNull(),
  itemVersionId:uuid("item_version_id").notNull(),position:integer("position").notNull(),
  pointsOverride:numeric("points_override",{precision:12,scale:4}),
});
export const assessmentItemVersions = educationV30.table("assessment_item_versions",{
  id:id(),responseKind:text("response_kind").$type<"single_select"|"multi_select"|"true_false"|
    "short_text"|"essay"|"numeric"|"math_expression"|"matching"|"ordering"|"audio_response"|
    "audio_listening"|"video_response"|"file_upload"|"practical"|"oral"|"portfolio"|"other">().notNull(),
  itemPrompt:jsonb("item_prompt").$type<Record<string,unknown>>().notNull(),
  maximumPoints:numeric("maximum_points",{precision:12,scale:4}).notNull(),
  lifecycle:text("lifecycle").$type<"draft"|"published">().notNull(),
});
export const assessmentItemOptions = educationV30.table("assessment_item_options",{
  id:id(),itemVersionId:uuid("item_version_id").notNull(),
  optionKey:text("option_key").notNull(),ordinal:integer("ordinal").notNull(),
  displayContent:jsonb("display_content").$type<Record<string,unknown>>().notNull(),
});
export const assessmentItemSecureKeys = educationV30.table("assessment_item_secure_keys",{
  itemVersionId:uuid("item_version_id").primaryKey(),
  encryptedKey:bytea("encrypted_key").notNull(),
  encryptionKeyRef:text("encryption_key_ref").notNull(),
});
export const assessmentFormAdministrations = educationV30.table("assessment_administrations",{
  id:id(),administeringOrganizationId:uuid("administering_organization_id").notNull(),
  assessmentVersionId:uuid("assessment_version_id").notNull(),
  formVersionId:uuid("form_version_id").notNull(),
  courseVersionId:uuid("course_version_id"),deploymentId:uuid("deployment_id"),
  status:text("status").$type<"draft"|"open"|"paused"|"closed"|"cancelled">().notNull(),
  opensAt:timestamp("opens_at",{withTimezone:true}),
  closesAt:timestamp("closes_at",{withTimezone:true}),
  attemptLimit:integer("attempt_limit").notNull(),
  proctorPolicy:text("proctor_policy").notNull(),
});
export const assessmentAccess = educationV30.table("assessment_access_grants",{
  id:id(),administrationId:uuid("administration_id").notNull(),
  learnerId:uuid("learner_id").notNull(),courseAttemptId:uuid("course_attempt_id"),
  grantedByPersonId:uuid("granted_by_person_id").notNull(),
  accessStatus:text("access_status").$type<"pending"|"approved"|"revoked">().notNull().default("approved"),
  validFrom:timestamp("valid_from",{withTimezone:true}).notNull().defaultNow(),
  validThrough:timestamp("valid_through",{withTimezone:true}),
});
export const assessmentAccommodations = educationV30.table("assessment_accommodation_decisions",{
  id:id(),accessGrantId:uuid("access_grant_id").notNull(),revisionNo:integer("revision_no").notNull(),
  approvalStatus:text("approval_status").notNull(),
});
export const assessmentExecutionAttempts = educationV30.table("assessment_attempts",{
  id:id(),accessGrantId:uuid("access_grant_id").notNull(),
  administrationId:uuid("administration_id").notNull(),
  learnerId:uuid("learner_id").notNull(),formVersionId:uuid("form_version_id").notNull(),
  attemptNo:integer("attempt_no").notNull(),
  state:text("state").$type<"prepared"|"in_progress"|"submitted"|"scored"|"finalized"|"voided">().notNull().default("prepared"),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  startedAt:timestamp("started_at",{withTimezone:true}),
  submittedAt:timestamp("submitted_at",{withTimezone:true}),
  expiresAt:timestamp("expires_at",{withTimezone:true}),
  selectionSeed:bigint("selection_seed",{mode:"bigint"}).notNull(),
  accommodationDecisionId:uuid("accommodation_decision_id"),
  requestKey:text("request_key").notNull(),
});
export const assessmentExecutionItems = educationV30.table("assessment_attempt_items",{
  id:id(),attemptId:uuid("attempt_id").notNull(),
  formVersionId:uuid("form_version_id").notNull(),
  formItemId:uuid("form_item_id").notNull(),
  itemVersionId:uuid("item_version_id").notNull(),
  questionNumber:integer("question_number").notNull(),
  pointsAvailable:numeric("points_available",{precision:12,scale:4}).notNull(),
});
export const assessmentExecutionResponses = educationV30.table("assessment_response_versions",{
  id:id(),attemptItemId:uuid("attempt_item_id").notNull(),
  revisionNo:integer("revision_no").notNull(),
  responsePayload:jsonb("response_payload").$type<Record<string,unknown>>().notNull().default({}),
  responseState:text("response_state").$type<"saved"|"submitted">().notNull(),
  clientRequestId:text("client_request_id").notNull(),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
});
export const assessmentExecutionChoices = educationV30.table("assessment_response_choices",{
  responseVersionId:uuid("response_version_id").notNull(),
  attemptItemId:uuid("attempt_item_id").notNull(),
  itemVersionId:uuid("item_version_id").notNull(),
  optionId:uuid("option_id").notNull(),
  answerPosition:integer("answer_position").notNull(),
});
export const assessmentAutoScores = educationV30.table("assessment_item_scoring_decisions",{
  id:id(),attemptItemId:uuid("attempt_item_id").notNull(),
  responseVersionId:uuid("response_version_id").notNull(),
  scoringKind:text("scoring_kind").$type<"automated"|"human">().notNull(),
  scoringEngineVersion:text("scoring_engine_version"),
  score:numeric("score",{precision:12,scale:4}).notNull(),
  rubricEvidence:jsonb("rubric_evidence").$type<Record<string,unknown>>().notNull().default({}),
});
export const assessmentExecutionResults = educationV30.table("assessment_attempt_results",{
  id:id(),attemptId:uuid("attempt_id").notNull(),
  resultRevision:integer("result_revision").notNull(),
  resultStatus:text("result_status").$type<"provisional"|"reviewed"|"finalized"|"voided">().notNull(),
  pointsEarned:numeric("points_earned",{precision:12,scale:4}).notNull(),
  pointsPossible:numeric("points_possible",{precision:12,scale:4}).notNull(),
  outcome:text("outcome").$type<"pass"|"fail"|"inconclusive">(),
  reviewedByPersonId:uuid("reviewed_by_person_id"),
  supersedesId:uuid("supersedes_id"),
  resultEvidence:jsonb("result_evidence").$type<Record<string,unknown>>().notNull().default({}),
});
