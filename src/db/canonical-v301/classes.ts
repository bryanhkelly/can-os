import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
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

/** A private or assigned Class still has a Class Offering. Publication is
 * versioned, independently from its marketing visibility. */
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
  classOfferingVersionId:uuid("class_offering_version_id").notNull(),
  learnerPersonId:uuid("learner_person_id").notNull(),
  enrollmentMethod:text("enrollment_method").$type<"self"|"invitation"|"assignment"|"approval">().notNull(),
  creditMode:text("credit_mode").$type<"for_credit"|"audit"|"not_applicable">().notNull().default("not_applicable"),
  status:text("status").$type<"pending"|"active"|"completed"|"withdrawn"|"cancelled">().notNull().default("pending"),
  courseAttemptId:uuid("course_attempt_id"),
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
