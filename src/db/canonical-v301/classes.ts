import { boolean, index, integer, jsonb, numeric, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30, educationV30Secure } from "./core";
import type { FeedbackPrompt } from "@/domain/native-course-activities";
const id = () => uuid("id").defaultRandom().primaryKey();

/** Additive canonical model. A Class is an instance of one Course version;
 * creating it never grants adoption, Site authority, enrollment or awards. */
export const canonicalClasses = educationV30.table("classes", {
  id: id(),
  deploymentId: uuid("deployment_id").notNull(),
  adoptionId: uuid("adoption_id").notNull(),
  offeringVersionId: uuid("offering_version_id").notNull(),
  courseVersionId: uuid("course_version_id").notNull(),
  operatingOrganizationId: uuid("operating_organization_id").notNull(),
  siteId: uuid("site_id"),
  title: text("title").notNull(),
  capacity:integer("capacity"),
  deliveryMode: text("delivery_mode").$type<"self_paced"|"scheduled"|"facilitated"|"hybrid">().notNull(),
  state: text("state").$type<"draft"|"approved"|"active"|"completed"|"cancelled">().notNull().default("draft"),
  createdByPersonId: uuid("created_by_person_id").notNull(),
  createdAt: timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
  updatedAt: timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("canonical_classes_operator_idx").on(t.operatingOrganizationId,t.state),
  index("canonical_classes_course_idx").on(t.courseVersionId,t.deploymentId),
]);

export const canonicalClassOfferings = educationV30.table("class_offerings", {
  id:id(),classId:uuid("class_id").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("canonical_class_offerings_class_uq").on(t.classId)]);

/** A Class Offering is optional. It publishes access to a Class, not its identity. */
export const canonicalClassOfferingVersions = educationV30.table("class_offering_versions", {
  id:id(),classOfferingId:uuid("class_offering_id").notNull(),
  classId:uuid("class_id").notNull(),
  versionNo:integer("version_no").notNull(),
  visibility:text("visibility").$type<"public"|"unlisted"|"private">().notNull(),
  enrollmentMethods:text("enrollment_methods").array().$type<Array<"self"|"invitation"|"assignment"|"approval">>().notNull(),
  state:text("state").$type<"draft"|"published"|"closed">().notNull().default("draft"),
  opensAt:timestamp("opens_at",{withTimezone:true}),
  closesAt:timestamp("closes_at",{withTimezone:true}),
  capacity:integer("capacity"),
  allowedCreditModes:text("allowed_credit_modes").array().$type<Array<"for_credit"|"audit"|"not_applicable">>().notNull(),
  consentVersion:text("consent_version"),
  consentText:text("consent_text"),
  createdByPersonId:uuid("created_by_person_id").notNull(),
  publishedAt:timestamp("published_at",{withTimezone:true}),
  closedAt:timestamp("closed_at",{withTimezone:true}),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("canonical_class_offering_version_uq").on(t.classOfferingId,t.versionNo),
  uniqueIndex("canonical_class_offering_version_class_uq").on(t.id,t.classId),
]);

/** Same enrollment contract for school assignment, invitations, adult training
 * and auditing. The Class Enrollment is the native participation record. */
export const canonicalClassEnrollments = educationV30.table("class_enrollments", {
  id:id(),classId:uuid("class_id").notNull(),
  classOfferingVersionId:uuid("class_offering_version_id"),
  learnerPersonId:uuid("learner_person_id").notNull(),
  enrollmentMethod:text("enrollment_method").$type<"self"|"invitation"|"assignment"|"approval">().notNull(),
  creditMode:text("credit_mode").$type<"for_credit"|"audit"|"not_applicable">().notNull().default("not_applicable"),
  status:text("status").$type<"pending"|"active"|"completed"|"withdrawn"|"cancelled">().notNull().default("pending"),
  courseAttemptId:uuid("course_attempt_id"),
  enrolledByPersonId:uuid("enrolled_by_person_id").notNull(),
  consentVersion:text("consent_version"),
  consentSha256:text("consent_sha256"),
  consentedAt:timestamp("consented_at",{withTimezone:true}),
  enrolledAt:timestamp("enrolled_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("canonical_class_enroll_person_idx").on(t.learnerPersonId,t.status),
  index("canonical_class_enroll_class_idx").on(t.classId,t.status),
]);

export const canonicalClassOutcomes = educationV30.table("class_outcomes", {
  id:id(),classEnrollmentId:uuid("class_enrollment_id").notNull(),
  outcomeKind:text("outcome_kind").$type<"grade"|"competency"|"completion"|"assessment">().notNull(),
  resultCode:text("result_code").notNull(),
  sourceKind:text("source_kind").notNull(),sourceId:uuid("source_id").notNull(),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[uniqueIndex("canonical_class_outcome_source_uq").on(t.classEnrollmentId,t.outcomeKind,t.sourceKind,t.sourceId)]);

/** No issuer may grant credit solely from completion or stated credit intent. */
export const canonicalClassAwards = educationV30.table("class_awards", {
  id:id(),classOutcomeId:uuid("class_outcome_id").notNull(),
  awardKind:text("award_kind").$type<"academic_credit"|"certificate"|"credential"|"participation">().notNull(),
  issuingOrganizationId:uuid("issuing_organization_id").notNull(),
  policyEvidenceVersionId:uuid("policy_evidence_version_id").notNull(),
  issuedByPersonId:uuid("issued_by_person_id").notNull(),
  issuedAt:timestamp("issued_at",{withTimezone:true}).notNull().defaultNow(),
  revokedAt:timestamp("revoked_at",{withTimezone:true}),
},t=>[index("canonical_class_awards_outcome_idx").on(t.classOutcomeId,t.issuedAt)]);


/** Class-specific instructional authority; a Site-wide role or publisher
 * presenter identity never grants access to an individual Class roster.
 * An independently verified canonical role/grant remains required. */
export const canonicalClassStaffAssignments = educationV30.table("class_staff_assignments", {
  id:id(),
  classId:uuid("class_id").notNull(),
  personId:uuid("person_id").notNull(),
  roleCode:text("role_code").$type<"teacher"|"facilitator">().notNull(),
  attendanceAuthorized:boolean("attendance_authorized").notNull().default(false),
  state:text("state").$type<"approved"|"suspended"|"ended">().notNull().default("approved"),
  beginsAt:timestamp("begins_at",{withTimezone:true}).notNull(),
  endsAt:timestamp("ends_at",{withTimezone:true}),
  assignedByPersonId:uuid("assigned_by_person_id").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  index("canonical_class_staff_class_idx").on(t.classId,t.state),
  index("canonical_class_staff_person_idx").on(t.personId,t.state),
]);


/** A Class owns dated delivery by reference to the canonical Session and
 * its existing facilitated classroom plan. Scheduling never creates a second
 * learner identity, gradebook or Class Enrollment. */
export const canonicalClassSessions=educationV30.table("class_sessions",{
  id:id(),
  classId:uuid("class_id").notNull(),
  classroomPlanId:uuid("classroom_plan_id").notNull(),
  deliverySessionId:uuid("delivery_session_id").notNull(),
  facilitatorPersonId:uuid("facilitator_person_id").notNull(),
  requestId:uuid("request_id").notNull(),
  createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("canonical_class_session_plan_uq").on(t.classroomPlanId),
  uniqueIndex("canonical_class_session_delivery_uq").on(t.deliverySessionId),
  uniqueIndex("canonical_class_session_request_uq").on(t.classId,t.facilitatorPersonId,t.requestId),
  index("canonical_class_session_class_idx").on(t.classId,t.createdAt),
]);


/** One reusable, versioned, publisher-approved learning check and feedback
 * contract per canonical Course version, shared across all authorized Classes.
 * Keys and raw personal feedback live in the secure schema, NEVER in public
 * Class or projector data.
 */
export const canonicalCourseActivitySets=educationV30.table("course_activity_sets",{
  id:id(),courseVersionId:uuid("course_version_id").notNull(),
  publisherOrganizationId:uuid("publisher_organization_id").notNull(),
  versionNo:integer("version_no").notNull(),
  title:text("title").notNull(),
  quizQuestions:jsonb("quiz_questions").$type<Array<{
    key:string;prompt:string;choices:string[];
  }>>().notNull(),
  feedbackQuestions:jsonb("feedback_questions").$type<FeedbackPrompt[]>().notNull(),
  passingFraction:numeric("passing_fraction",{precision:6,scale:5}).notNull(),
  maxQuizAttempts:integer("max_quiz_attempts").notNull(),
  requireAllLessons:boolean("require_all_lessons").notNull().default(false),
  feedbackRequired:boolean("feedback_required").notNull().default(false),
  feedbackConsentVersion:text("feedback_consent_version").notNull(),
  feedbackConsentText:text("feedback_consent_text").notNull(),
  state:text("state").$type<"published"|"closed">().notNull().default("published"),
  createdByPersonId:uuid("created_by_person_id").notNull(),
  publishedAt:timestamp("published_at",{withTimezone:true}).notNull().defaultNow(),
  closedAt:timestamp("closed_at",{withTimezone:true}),
},t=>[uniqueIndex("course_activity_version_uq").on(t.courseVersionId,t.versionNo)]);
export const canonicalCourseActivityAnswerKeys=educationV30Secure.table("course_activity_answer_keys",{
  activitySetId:uuid("activity_set_id").primaryKey(),
  answerKeys:jsonb("answer_keys").$type<Record<string,number>>().notNull(),
});
export const canonicalClassActivityPins=educationV30.table("class_activity_enrollment_pins",{
  classEnrollmentId:uuid("class_enrollment_id").primaryKey(),
  activitySetId:uuid("activity_set_id").notNull(),
  pinnedAt:timestamp("pinned_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[index("class_activity_pins_by_set_idx").on(t.activitySetId)]);
export const canonicalClassActivitySubmissions=educationV30.table("class_activity_submissions",{
  id:id(),
  classEnrollmentId:uuid("class_enrollment_id").notNull(),
  activitySetId:uuid("activity_set_id").notNull(),
  kind:text("kind").$type<"quiz"|"feedback">().notNull(),
  attemptNo:integer("attempt_no").notNull().default(1),
  requestId:uuid("request_id").notNull(),
  quizFraction:numeric("quiz_fraction",{precision:6,scale:5}),
  quizPassed:boolean("quiz_passed"),
  feedbackConsentVersion:text("feedback_consent_version"),
  feedbackConsentSha256:text("feedback_consent_sha256"),
  feedbackConsentedAt:timestamp("feedback_consented_at",{withTimezone:true}),
  submittedAt:timestamp("submitted_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[
  uniqueIndex("class_activity_submission_attempt_uq").on(t.classEnrollmentId,t.activitySetId,t.kind,t.attemptNo),
  uniqueIndex("class_activity_submission_request_uq").on(t.classEnrollmentId,t.requestId),
]);
export const canonicalClassActivityAnswers=educationV30Secure.table("class_activity_submission_answers",{
  submissionId:uuid("submission_id").primaryKey(),
  answers:jsonb("answers").$type<unknown[]>().notNull(),
  recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
});
