import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { isNull } from "drizzle-orm";
import {
  educationV30,
  educationV30Secure,
  type JsonObject,
  type JsonValue,
} from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const evidenceDocumentVersions = educationV30.table("evidence_document_versions", {
  id: id(),
  documentId: uuid("document_id").notNull(),
  validFrom: date("valid_from", { mode: "string" }),
  validThrough: date("valid_through", { mode: "string" }),
  verifiedByPersonId: uuid("verified_by_person_id"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const evidenceDocuments = educationV30.table("evidence_documents", {
  id: id(),
  kindCode: text("kind_code").notNull(),
  owningOrganizationId: uuid("owning_organization_id"),
});

export const educationOperationOrganizationRoles = educationV30.table(
  "education_operation_organization_roles",
  {
    id: id(),
    operationId: uuid("operation_id").notNull(),
    organizationId: uuid("organization_id").notNull(),
    roleCode: text("role_code").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    status: text("status")
      .$type<"proposed" | "approved" | "suspended" | "ended">()
      .notNull()
      .default("proposed"),
  },
);

export const courses = educationV30.table("courses", {
  id: id(),
  publisherOrganizationId: uuid("publisher_organization_id").notNull(),
  courseCode: text("course_code").notNull(),
  title: text("title").notNull(),
  subject: text("subject"),
});

export const serviceCapabilities = educationV30.table("service_capabilities", {
  id: id(),
  code: text("code").notNull(),
});

export const professionalCapabilityAuthorizations = educationV30.table(
  "professional_capability_authorizations",
  {
    id: id(),
    personId: uuid("person_id").notNull(),
    capabilityId: uuid("capability_id").notNull(),
    geographicAreaId: uuid("geographic_area_id"),
    operationId: uuid("operation_id"),
    offeringId: uuid("offering_id"),
    decision: text("decision")
      .$type<"pending" | "approved" | "suspended" | "revoked" | "expired">()
      .notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    evidenceVersionId: uuid("evidence_version_id"),
  },
);

export const professionalRoleAssignments = educationV30.table(
  "professional_role_assignments",
  {
    id: id(),
    personId: uuid("person_id").notNull(),
    appointingOrganizationId: uuid("appointing_organization_id").notNull(),
    roleCode: text("role_code").notNull(),
    organizationId: uuid("organization_id"),
    operationId: uuid("operation_id"),
    deploymentId: uuid("deployment_id"),
    sectionId: uuid("section_id"),
    learnerId: uuid("learner_id"),
    offeringId: uuid("offering_id"),
    courseId: uuid("course_id"),
    capabilityAuthorizationId: uuid("capability_authorization_id"),
    capabilityId: uuid("capability_id"),
    beginsAt: timestamp("begins_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    state: text("state").$type<"proposed" | "approved" | "suspended" | "ended">().notNull(),
    authorityEvidenceId: uuid("authority_evidence_id"),
  },
);

export const courseVersions = educationV30.table(
  "course_versions",
  {
    id: id(),
    courseId: uuid("course_id").notNull(),
    versionNo: integer("version_no").notNull(),
    syllabus: jsonb("syllabus").$type<JsonValue>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("course_versions_course_version_uq").on(table.courseId, table.versionNo),
    uniqueIndex("course_versions_id_course_uq").on(table.id, table.courseId),
  ],
);

export const courseUnits = educationV30.table(
  "course_units",
  {
    id: id(),
    courseVersionId: uuid("course_version_id").notNull(),
    unitKey: text("unit_key").notNull(),
    title: text("title").notNull(),
    sequenceNo: integer("sequence_no").notNull(),
    content: jsonb("content").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("course_units_version_key_uq").on(table.courseVersionId, table.unitKey),
    uniqueIndex("course_units_id_version_uq").on(table.id, table.courseVersionId),
  ],
);

export const courseLessons = educationV30.table(
  "course_lessons",
  {
    id: id(),
    courseVersionId: uuid("course_version_id").notNull(),
    courseUnitId: uuid("course_unit_id").notNull(),
    lessonKey: text("lesson_key").notNull(),
    title: text("title").notNull(),
    lessonOrder: integer("lesson_order").notNull(),
    content: jsonb("content").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("course_lessons_version_key_uq").on(table.courseVersionId, table.lessonKey),
    uniqueIndex("course_lessons_id_version_uq").on(table.id, table.courseVersionId),
  ],
);

export const contentAssets = educationV30.table("content_assets", {
  id: id(),
  ownerOrganizationId: uuid("owner_organization_id").notNull(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  externalUrl: text("external_url"),
  createdAt: createdAt(),
});

export const contentAssetVersions = educationV30.table(
  "content_asset_versions",
  {
    id: id(),
    assetId: uuid("asset_id").notNull(),
    versionNo: integer("version_no").notNull(),
    storageReference: text("storage_reference"),
    sha256: text("sha256"),
    licenseTerms: jsonb("license_terms").$type<JsonValue>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("content_asset_versions_asset_version_uq").on(table.assetId, table.versionNo),
  ],
);

export const instructionalTracks = educationV30.table(
  "instructional_tracks",
  {
    id: id(),
    courseId: uuid("course_id").notNull(),
    presenterPersonId: uuid("presenter_person_id"),
    producerOrganizationId: uuid("producer_organization_id"),
    title: text("title").notNull(),
  },
  (table) => [uniqueIndex("instructional_tracks_id_course_uq").on(table.id, table.courseId)],
);

export const instructionalTrackVersions = educationV30.table(
  "instructional_track_versions",
  {
    id: id(),
    instructionalTrackId: uuid("instructional_track_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    courseId: uuid("course_id").notNull(),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    versionNo: integer("version_no").notNull(),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    trackKind: text("track_kind").$type<"primary" | "supplemental">().notNull().default("primary"),
    submissionManifestHash: text("submission_manifest_hash"),
    submittedByPersonId: uuid("submitted_by_person_id"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("instructional_track_versions_track_version_uq").on(
      table.instructionalTrackId,
      table.versionNo,
    ),
    uniqueIndex("instructional_track_versions_id_course_version_uq").on(
      table.id,
      table.courseVersionId,
    ),
    uniqueIndex("instructional_track_versions_id_track_uq").on(
      table.id,
      table.instructionalTrackId,
    ),
  ],
);

export const instructionalTrackMaterials = educationV30.table(
  "instructional_track_materials",
  {
    id: id(),
    trackVersionId: uuid("track_version_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    courseUnitId: uuid("course_unit_id").notNull(),
    assetVersionId: uuid("asset_version_id"),
    materialKind: text("material_kind")
      .$type<"instruction" | "practice" | "reference">()
      .notNull(),
    activitySpec: jsonb("activity_spec").$type<JsonValue>().notNull().default({}),
  },
);

export const instructionalTrackReviews = educationV30.table(
  "instructional_track_reviews",
  {
    decisionOrder: bigint("decision_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    id: id(),
    trackVersionId: uuid("track_version_id").notNull(),
    manifestHash: text("manifest_hash").notNull(),
    reviewerPersonId: uuid("reviewer_person_id").notNull(),
    reviewKind: text("review_kind")
      .$type<"academic" | "rights" | "accessibility" | "coverage" | "safeguarding">()
      .notNull(),
    decision: text("decision")
      .$type<"approved" | "rejected" | "changes_requested" | "withdrawn">()
      .notNull(),
    rationale: text("rationale").notNull(),
    evidenceVersionId: uuid("evidence_version_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("instructional_track_reviews_order_uq").on(table.decisionOrder),
  ],
);

export const trackDistributionAuthorizations = educationV30.table(
  "track_distribution_authorizations",
  {
    id: id(),
    trackVersionId: uuid("track_version_id").notNull(),
    approvedOrganizationId: uuid("approved_organization_id"),
    approvedOperationId: uuid("approved_operation_id"),
    approvedOfferingId: uuid("approved_offering_id"),
    geographicAreaId: uuid("geographic_area_id"),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    status: text("status")
      .$type<"proposed" | "approved" | "suspended" | "revoked">()
      .notNull()
      .default("proposed"),
    rightsEvidenceVersionId: uuid("rights_evidence_version_id"),
  },
);

export const deploymentOrganizationRoles = educationV30.table("deployment_organization_roles", {
  id: id(),
  deploymentId: uuid("deployment_id").notNull(),
  organizationId: uuid("organization_id").notNull(),
  roleCode: text("role_code").notNull(),
  courseId: uuid("course_id"),
  siteId: uuid("site_id"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  approvalStatus: text("approval_status")
    .$type<"proposed" | "approved" | "suspended" | "ended">()
    .notNull()
    .default("proposed"),
  evidenceVersionId: uuid("evidence_version_id"),
});

export const trackLessonPresentations = educationV30.table(
  "track_lesson_presentations",
  {
    id: id(),
    trackVersionId: uuid("track_version_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    courseLessonId: uuid("course_lesson_id").notNull(),
    assetVersionId: uuid("asset_version_id").notNull(),
    presentationKind: text("presentation_kind")
      .$type<"primary" | "worked_example" | "supplement" | "alternate_language">()
      .notNull(),
    ordinal: integer("ordinal").notNull().default(1),
    accessibilityNotes: jsonb("accessibility_notes").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("track_lesson_presentations_unique").on(
      table.trackVersionId,
      table.courseLessonId,
      table.presentationKind,
      table.ordinal,
    ),
  ],
);

export const publishedAssetReviews = educationV30.table("published_asset_reviews", {
  decisionOrder: bigint("decision_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
  id: id(),
  assetVersionId: uuid("asset_version_id").notNull(),
  reviewerPersonId: uuid("reviewer_person_id").notNull(),
  reviewKind: text("review_kind")
    .$type<"rights" | "accessibility" | "academic" | "independent">()
    .notNull(),
  decision: text("decision").$type<"approved" | "rejected" | "withdrawn">().notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
  evidenceVersionId: uuid("evidence_version_id"),
});

export const contentPublicationManifests = educationV30.table(
  "content_publication_manifests",
  {
    id: id(),
    ownerOrganizationId: uuid("owner_organization_id").notNull(),
    trackVersionId: uuid("track_version_id"),
    foundationVersionId: uuid("foundation_version_id"),
    offeringVersionId: uuid("offering_version_id"),
    manifestHash: text("manifest_hash").notNull(),
    manifestStatus: text("manifest_status").$type<"draft" | "approved">().notNull().default("draft"),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("content_publication_manifests_hash_uq").on(table.manifestHash),
  ],
);

export const contentPublicationManifestItems = educationV30.table(
  "content_publication_manifest_items",
  {
    id: id(),
    manifestId: uuid("manifest_id").notNull(),
    contentAssetVersionId: uuid("content_asset_version_id").notNull(),
    usageKind: text("usage_kind")
      .$type<"required_instruction" | "supporting" | "accessibility" | "assessment">()
      .notNull(),
    contentHash: text("content_hash").notNull(),
    rightsEvidenceVersionId: uuid("rights_evidence_version_id"),
  },
  (table) => [
    uniqueIndex("content_publication_manifest_items_unique").on(
      table.manifestId,
      table.contentAssetVersionId,
      table.usageKind,
    ),
  ],
);

export const contentManifestReviewDecisions = educationV30.table(
  "content_manifest_review_decisions",
  {
    id: id(),
    manifestId: uuid("manifest_id").notNull(),
    reviewKind: text("review_kind")
      .$type<"academic" | "rights" | "accessibility" | "coverage" | "safety">()
      .notNull(),
    reviewerPersonId: uuid("reviewer_person_id").notNull(),
    decision: text("decision").$type<"approved" | "rejected" | "withdrawn">().notNull(),
    decisionOrder: bigint("decision_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    evidenceVersionId: uuid("evidence_version_id"),
  },
  (table) => [
    uniqueIndex("content_manifest_review_decisions_order_uq").on(table.decisionOrder),
  ],
);

export const contentWithdrawals = educationV30.table("content_withdrawals", {
  id: id(),
  assetVersionId: uuid("asset_version_id"),
  courseVersionId: uuid("course_version_id"),
  trackVersionId: uuid("track_version_id"),
  offeringVersionId: uuid("offering_version_id"),
  withdrawalKind: text("withdrawal_kind")
    .$type<"routine_retirement" | "urgent_rights" | "urgent_safety">()
    .notNull()
    .default("urgent_safety"),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  legacyAccessUntil: timestamp("legacy_access_until", { withTimezone: true }),
  reason: text("reason").notNull(),
  authorizedByPersonId: uuid("authorized_by_person_id").notNull(),
});

export const instructionalTrackPolicyVersions = educationV30.table(
  "instructional_track_policy_versions",
  {
    id: id(),
    deploymentId: uuid("deployment_id").notNull(),
    adoptionId: uuid("adoption_id").notNull(),
    offeringVersionId: uuid("offering_version_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    versionNo: integer("version_no").notNull(),
    authoringEnabled: boolean("authoring_enabled").notNull().default(false),
    studentChoiceEnabled: boolean("student_choice_enabled").notNull().default(false),
    practiceEnabled: boolean("practice_enabled").notNull().default(false),
    deliveryEnabled: boolean("delivery_enabled").notNull().default(false),
    selectionPolicy: text("selection_policy").$type<"student" | "guardian">().notNull(),
    allowSwitching: boolean("allow_switching").notNull().default(false),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
    effectiveThrough: timestamp("effective_through", { withTimezone: true }),
    createdByPersonId: uuid("created_by_person_id").notNull(),
    publishedByPersonId: uuid("published_by_person_id"),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("instructional_track_policy_version_scope_uq").on(
      table.deploymentId,
      table.adoptionId,
      table.courseVersionId,
      table.versionNo,
    ),
    uniqueIndex("instructional_track_policy_version_id_course_uq").on(
      table.id,
      table.courseVersionId,
    ),
  ],
);

export const instructionalTrackPolicyWithdrawals = educationV30.table(
  "instructional_track_policy_withdrawals",
  {
    id: id(),
    policyVersionId: uuid("policy_version_id").notNull(),
    effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
    reason: text("reason").notNull(),
    authorizedByPersonId: uuid("authorized_by_person_id").notNull(),
    recordedAt: createdAt(),
  },
);

export const officialCourseRequirementVersions = educationV30.table(
  "official_course_requirement_versions",
  {
    id: id(),
    courseVersionId: uuid("course_version_id").notNull(),
    requirementKey: text("requirement_key").notNull(),
    requirementKind: text("requirement_kind")
      .$type<"lesson" | "homework" | "assessment" | "project" | "credit" | "competency" | "completion">()
      .notNull(),
    mandatory: boolean("mandatory").notNull().default(true),
    requirementSpec: jsonb("requirement_spec").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("official_course_requirements_id_version_uq").on(table.id, table.courseVersionId),
    uniqueIndex("official_course_requirements_version_key_uq").on(
      table.courseVersionId,
      table.requirementKey,
    ),
  ],
);

export const officialCourseAssignmentVersions = educationV30.table(
  "official_course_assignment_versions",
  {
    id: id(),
    courseVersionId: uuid("course_version_id").notNull(),
    assignmentKey: text("assignment_key").notNull(),
    officialSpec: jsonb("official_spec").$type<JsonValue>().notNull().default({}),
    rubric: jsonb("rubric").$type<JsonValue>().notNull().default({}),
    required: boolean("required").notNull().default(true),
    weight: numeric("weight", { precision: 8, scale: 4 }),
  },
  (table) => [
    uniqueIndex("official_course_assignments_id_version_uq").on(table.id, table.courseVersionId),
    uniqueIndex("official_course_assignments_version_key_uq").on(
      table.courseVersionId,
      table.assignmentKey,
    ),
  ],
);

export const learnerProfiles = educationV30.table("learner_profiles", {
  id: id(),
  personId: uuid("person_id").notNull(),
  createdAt: createdAt(),
  metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
});

export const guardianAuthorities = educationV30.table("guardian_authorities", {
  id: id(),
  guardianPersonId: uuid("guardian_person_id").notNull(),
  learnerId: uuid("learner_id").notNull(),
  authorityKind: text("authority_kind").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
});

export const enrollments = educationV30.table(
  "enrollments",
  {
    id: id(),
    learnerId: uuid("learner_id").notNull(),
    deploymentId: uuid("deployment_id").notNull(),
    cohortId: uuid("cohort_id"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
    status: text("status")
      .$type<"pending" | "active" | "completed" | "withdrawn" | "cancelled">()
      .notNull()
      .default("pending"),
  },
  (table) => [
    uniqueIndex("enrollments_id_deployment_uq").on(table.id, table.deploymentId),
    uniqueIndex("enrollments_id_deployment_learner_uq").on(
      table.id,
      table.deploymentId,
      table.learnerId,
    ),
  ],
);

export const learnerCourseAttempts = educationV30.table(
  "learner_course_attempts",
  {
    id: id(),
    enrollmentId: uuid("enrollment_id"),
    noncreditRegistrationId: uuid("noncredit_registration_id"),
    classEnrollmentId: uuid("class_enrollment_id"),
    deploymentId: uuid("deployment_id").notNull(),
    adoptionId: uuid("adoption_id").notNull(),
    offeringVersionId: uuid("offering_version_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    sectionId: uuid("section_id"),
    attemptNo: integer("attempt_no").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    status: text("status")
      .$type<"planned" | "active" | "completed" | "withdrawn">()
      .notNull()
      .default("active"),
  },
  (table) => [
    uniqueIndex("learner_course_attempts_enrollment_version_attempt_uq").on(
      table.enrollmentId,
      table.courseVersionId,
      table.attemptNo,
    ),
    uniqueIndex("learner_course_attempts_id_version_uq").on(table.id, table.courseVersionId),
    uniqueIndex("learner_course_attempts_id_enrollment_uq").on(table.id, table.enrollmentId),
    uniqueIndex("learner_course_attempts_noncredit_version_attempt_uq").on(
      table.noncreditRegistrationId,
      table.courseVersionId,
      table.attemptNo,
    ),
  ],
);

export const noncreditTrainingVersions = educationV30.table("noncredit_training_versions", {
  id: id(),
  offeringVersionId: uuid("offering_version_id").notNull(),
  providerOrganizationId: uuid("provider_organization_id").notNull(),
  title: text("title").notNull(),
  requiredInstructionMinutes: integer("required_instruction_minutes").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  state: text("state").$type<"draft" | "published">().notNull(),
  authorPersonId: uuid("author_person_id").notNull(),
  approvedByPersonId: uuid("approved_by_person_id"),
  assessmentVersionId: uuid("assessment_version_id"),
  baselineAssessmentVersionId: uuid("baseline_assessment_version_id"),
});

export const noncreditRegistrations = educationV30.table("noncredit_registrations", {
  id: id(),
  deploymentId: uuid("deployment_id").notNull(),
  trainingVersionId: uuid("training_version_id").notNull(),
  adoptionId: uuid("adoption_id").notNull(),
  offeringVersionId: uuid("offering_version_id").notNull(),
  participantPersonId: uuid("participant_person_id").notNull(),
  learnerId: uuid("learner_id"),
  registeringOrganizationId: uuid("registering_organization_id").notNull(),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  completionPolicyId: uuid("completion_policy_id"),
  status: text("status")
    .$type<"registered" | "active" | "completed" | "withdrawn" | "cancelled">()
    .notNull()
    .default("registered"),
  consentEvidenceId: uuid("consent_evidence_id"),
});

export const learnerUnitProgress = educationV30.table(
  "learner_unit_progress",
  {
    id: id(),
    courseAttemptId: uuid("course_attempt_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    courseUnitId: uuid("course_unit_id").notNull(),
    status: text("status").$type<"not_started" | "in_progress" | "completed" | "waived">().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_unit_progress_attempt_unit_uq").on(
      table.courseAttemptId,
      table.courseUnitId,
    ),
  ],
);

export const learnerLessonProgress = educationV30.table(
  "learner_lesson_progress",
  {
    id: id(),
    courseAttemptId: uuid("course_attempt_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    lessonId: uuid("lesson_id").notNull(),
    status: text("status").$type<"not_started" | "in_progress" | "completed" | "waived">().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("learner_lesson_progress_attempt_lesson_uq").on(
      table.courseAttemptId,
      table.lessonId,
    ),
  ],
);

export const learnerTrackSelections = educationV30.table(
  "learner_track_selections",
  {
    id: id(),
    courseAttemptId: uuid("course_attempt_id").notNull(),
    courseVersionId: uuid("course_version_id").notNull(),
    trackVersionId: uuid("track_version_id").notNull(),
    policyVersionId: uuid("policy_version_id").notNull(),
    revision: integer("revision").notNull(),
    selectedAt: timestamp("selected_at", { withTimezone: true }).notNull(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    selectedByPersonId: uuid("selected_by_person_id"),
    selectionSource: text("selection_source")
      .$type<"learner" | "guardian" | "institutional_default" | "authorized_assistance">()
      .notNull()
      .default("learner"),
    switchReason: text("switch_reason"),
  },
  (table) => [
    uniqueIndex("learner_track_selections_attempt_selected_uq").on(
      table.courseAttemptId,
      table.selectedAt,
    ),
    uniqueIndex("learner_track_selections_attempt_revision_uq").on(
      table.courseAttemptId,
      table.revision,
    ),
    uniqueIndex("learner_one_active_primary_track")
      .on(table.courseAttemptId)
      .where(isNull(table.supersededAt)),
  ],
);

export const formativePracticeAttempts = educationV30.table("formative_practice_attempts", {
  id: id(),
  courseAttemptId: uuid("course_attempt_id").notNull(),
  courseVersionId: uuid("course_version_id").notNull(),
  trackVersionId: uuid("track_version_id"),
  policyVersionId: uuid("policy_version_id"),
  courseUnitId: uuid("course_unit_id").notNull(),
  scoreNumeric: numeric("score_numeric", { precision: 8, scale: 3 }),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});

export const instructionalTrackCommandReceipts = educationV30.table(
  "instructional_track_command_receipts",
  {
    actorPersonId: uuid("actor_person_id").notNull(),
    requestId: uuid("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result").$type<JsonObject>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.actorPersonId, table.requestId] })],
);

export const formativePracticeResponses = educationV30Secure.table(
  "formative_practice_responses",
  {
    practiceAttemptId: uuid("practice_attempt_id")
      .primaryKey()
      .references(() => formativePracticeAttempts.id),
    response: jsonb("response").$type<JsonObject>().notNull(),
    privacyClass: text("privacy_class")
      .$type<"restricted" | "highly_restricted">()
      .notNull()
      .default("restricted"),
    retainedUntil: timestamp("retained_until", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const assessmentDefinitions = educationV30.table(
  "assessment_definitions",
  {
    id: id(),
    ownerOrganizationId: uuid("owner_organization_id").notNull(),
    assessmentKey: text("assessment_key").notNull(),
    title: text("title").notNull(),
    purpose: text("purpose")
      .$type<"official" | "diagnostic" | "placement" | "readiness" | "foundation" | "formative" | "mastery" | "credential" | "practice">()
      .notNull(),
    courseId: uuid("course_id"),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
  },
  (table) => [
    uniqueIndex("assessment_definitions_owner_key_uq").on(
      table.ownerOrganizationId,
      table.assessmentKey,
    ),
    uniqueIndex("assessment_definitions_id_course_uq").on(table.id, table.courseId),
  ],
);

export const assessmentVersions = educationV30.table(
  "assessment_versions",
  {
    id: id(),
    assessmentId: uuid("assessment_id").notNull(),
    courseVersionId: uuid("course_version_id"),
    assessmentKey: text("assessment_key").notNull(),
    versionNo: integer("version_no").notNull(),
    blueprint: jsonb("blueprint").$type<JsonValue>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("assessment_versions_assessment_version_uq").on(
      table.assessmentId,
      table.versionNo,
    ),
    uniqueIndex("assessment_versions_id_assessment_uq").on(table.id, table.assessmentId),
    uniqueIndex("assessment_versions_id_course_version_uq").on(table.id, table.courseVersionId),
  ],
);

export type CourseVersionRow = typeof courseVersions.$inferSelect;
export type InstructionalTrackVersionRow = typeof instructionalTrackVersions.$inferSelect;
export type InstructionalTrackPolicyVersionRow =
  typeof instructionalTrackPolicyVersions.$inferSelect;
export type LearnerCourseAttemptRow = typeof learnerCourseAttempts.$inferSelect;
export type LearnerTrackSelectionRow = typeof learnerTrackSelections.$inferSelect;
export type FormativePracticeAttemptRow = typeof formativePracticeAttempts.$inferSelect;
export type ContentPublicationManifestRow = typeof contentPublicationManifests.$inferSelect;
export type AssessmentVersionRow = typeof assessmentVersions.$inferSelect;
export type FormativePracticeResponseRow = typeof formativePracticeResponses.$inferSelect;
