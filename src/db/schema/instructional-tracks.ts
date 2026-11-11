import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { courseTemplates, courseTemplateVersions, enrollments } from "./academics";
import { organizations } from "./organizations";
import { people } from "./identity";
import { curriculumResources } from "./curriculum-resources";

// These are content identities, never Section staffing or gradebook records.
export const instructionalTracks = pgTable("instructional_tracks", {
  id: id(),
  courseTemplateId: uuid("course_template_id").notNull().references(() => courseTemplates.id, { onDelete: "restrict" }),
  presenterPersonId: uuid("presenter_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  producerOrganizationId: uuid("producer_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  slug: text("slug").notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("instructional_track_producer_course_slug_uq").on(t.producerOrganizationId, t.courseTemplateId, t.slug),
  index("instructional_track_course_idx").on(t.courseTemplateId),
  index("instructional_track_presenter_idx").on(t.presenterPersonId),
  check("instructional_track_title_ck", sql`length(trim(${t.title})) between 1 and 250`),
]);

export const instructionalTrackVersions = pgTable("instructional_track_versions", {
  id: id(),
  trackId: uuid("track_id").notNull().references(() => instructionalTracks.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status", { enum: ["draft", "in_review", "approved", "published", "retired"] }).default("draft").notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  // Hash includes media, practice, private solutions, resource snapshots and rights evidence.
  manifestHash: text("manifest_hash"),
  rightsEvidenceResourceId: uuid("rights_evidence_resource_id").references(() => curriculumResources.id, { onDelete: "restrict" }),
  rightsExpiresAt: timestamp("rights_expires_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("instructional_track_version_uq").on(t.trackId, t.version),
  index("instructional_track_version_course_idx").on(t.courseTemplateVersionId),
  index("instructional_track_version_author_idx").on(t.createdByPersonId),
  index("instructional_track_version_rights_idx").on(t.rightsEvidenceResourceId),
  check("instructional_track_version_positive_ck", sql`${t.version} > 0`),
  check("instructional_track_version_status_ck", sql`${t.status} in ('draft','in_review','approved','published','retired')`),
  check("instructional_track_version_hash_ck", sql`${t.manifestHash} is null or ${t.manifestHash} ~ '^[a-f0-9]{64}$'`),
  check("instructional_track_version_review_manifest_ck", sql`${t.status} = 'draft' or ${t.manifestHash} is not null`),
  check("instructional_track_version_publication_ck", sql`(${t.status} in ('published','retired')) = (${t.publishedAt} is not null)`),
]);

export const instructionalTrackLessons = pgTable("instructional_track_lessons", {
  id: id(),
  trackVersionId: uuid("track_version_id").notNull().references(() => instructionalTrackVersions.id, { onDelete: "restrict" }),
  publisherLessonId: text("publisher_lesson_id").notNull(),
  resourceId: uuid("resource_id").notNull().references(() => curriculumResources.id, { onDelete: "restrict" }),
  captionResourceId: uuid("caption_resource_id").references(() => curriculumResources.id, { onDelete: "restrict" }),
  transcriptResourceId: uuid("transcript_resource_id").references(() => curriculumResources.id, { onDelete: "restrict" }),
  placement: text("placement", { enum: ["primary", "supplemental"] }).default("primary").notNull(),
  sequence: integer("sequence").default(0).notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("instructional_track_lesson_slot_uq").on(t.trackVersionId, t.publisherLessonId, t.placement, t.sequence),
  index("instructional_track_lesson_resource_idx").on(t.resourceId),
  index("instructional_track_lesson_caption_idx").on(t.captionResourceId),
  index("instructional_track_lesson_transcript_idx").on(t.transcriptResourceId),
  check("instructional_track_lesson_sequence_ck", sql`${t.sequence} >= 0`),
  check("instructional_track_lesson_placement_ck", sql`${t.placement} in ('primary','supplemental')`),
]);

// Only student-safe definitions belong here. Scoring/answer data lives in a separate table.
export const instructionalTrackActivities = pgTable("instructional_track_activities", {
  id: id(),
  trackVersionId: uuid("track_version_id").notNull().references(() => instructionalTrackVersions.id, { onDelete: "restrict" }),
  publisherLessonId: text("publisher_lesson_id").notNull(),
  activityKey: text("activity_key").notNull(),
  title: text("title").notNull(),
  kind: text("kind", { enum: ["practice_problem_set", "interactive_exercise", "formative_quiz", "worked_example", "project_practice", "reflection"] }).notNull(),
  body: jsonb("body").$type<{ instructions: string; prompts: { key: string; text: string }[] }>(),
  resourceId: uuid("resource_id").references(() => curriculumResources.id, { onDelete: "restrict" }),
  recommendationLevel: text("recommendation_level", { enum: ["suggested", "strongly_recommended"] }).default("suggested").notNull(),
  sequence: integer("sequence").default(0).notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("instructional_track_activity_key_uq").on(t.trackVersionId, t.activityKey),
  index("instructional_track_activity_lesson_idx").on(t.trackVersionId, t.publisherLessonId, t.sequence),
  index("instructional_track_activity_resource_idx").on(t.resourceId),
  index("instructional_track_activity_author_idx").on(t.createdByPersonId),
  check("instructional_track_activity_kind_ck", sql`${t.kind} in ('practice_problem_set','interactive_exercise','formative_quiz','worked_example','project_practice','reflection')`),
  check("instructional_track_activity_recommendation_ck", sql`${t.recommendationLevel} in ('suggested','strongly_recommended')`),
  check("instructional_track_activity_sequence_ck", sql`${t.sequence} >= 0`),
  check("instructional_track_activity_minutes_ck", sql`${t.estimatedMinutes} is null or ${t.estimatedMinutes} > 0`),
  check("instructional_track_activity_content_ck", sql`${t.body} is not null or ${t.resourceId} is not null`),
]);

// SERVER ONLY: no student reader may select this table or spread its rows into a response.
export const instructionalTrackActivitySecrets = pgTable("instructional_track_activity_secrets", {
  id: id(),
  activityId: uuid("activity_id").notNull().references(() => instructionalTrackActivities.id, { onDelete: "restrict" }),
  solutions: jsonb("solutions").$type<{ promptKey: string; answer: string; explanation: string }[]>().notNull(),
  feedbackRelease: text("feedback_release", { enum: ["never", "after_attempt", "after_completion"] }).default("never").notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("instructional_track_activity_secrets_activity_uq").on(t.activityId),
  check("instructional_track_activity_feedback_ck", sql`${t.feedbackRelease} in ('never','after_attempt','after_completion')`),
]);

// Review decisions are append-only and refer to the entire submitted content hash.
export const instructionalTrackReviews = pgTable("instructional_track_reviews", {
  id: id(),
  decisionOrder: integer("decision_order").generatedAlwaysAsIdentity(),
  trackVersionId: uuid("track_version_id").notNull().references(() => instructionalTrackVersions.id, { onDelete: "restrict" }),
  manifestHash: text("manifest_hash").notNull(),
  criterion: text("criterion", { enum: ["academic", "rights", "accessibility", "safety"] }).notNull(),
  decision: text("decision", { enum: ["approved", "changes_requested", "rejected"] }).notNull(),
  reviewerPersonId: uuid("reviewer_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  rationale: text("rationale").notNull(),
  requestId: uuid("request_id").notNull(),
  createdAt: createdAt(),
}, t => [
  uniqueIndex("instructional_track_review_request_uq").on(t.reviewerPersonId, t.requestId),
  index("instructional_track_review_version_hash_idx").on(t.trackVersionId, t.manifestHash, t.decisionOrder),
  check("instructional_track_review_hash_ck", sql`${t.manifestHash} ~ '^[a-f0-9]{64}$'`),
  check("instructional_track_review_criterion_ck", sql`${t.criterion} in ('academic','rights','accessibility','safety')`),
  check("instructional_track_review_decision_ck", sql`${t.decision} in ('approved','changes_requested','rejected')`),
]);

// Operational restrictions are separate from immutable published content.
export const instructionalTrackWithdrawals = pgTable("instructional_track_withdrawals", {
  id: id(),
  trackVersionId: uuid("track_version_id").notNull().references(() => instructionalTrackVersions.id, { onDelete: "restrict" }),
  kind: text("kind", { enum: ["routine_retirement", "urgent_rights", "urgent_safety"] }).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  legacyAccessUntil: timestamp("legacy_access_until", { withTimezone: true }),
  reason: text("reason").notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
}, t => [
  index("instructional_track_withdrawal_version_idx").on(t.trackVersionId, t.effectiveAt),
  index("instructional_track_withdrawal_actor_idx").on(t.createdByPersonId),
  check("instructional_track_withdrawal_kind_ck", sql`${t.kind} in ('routine_retirement','urgent_rights','urgent_safety')`),
  check("instructional_track_withdrawal_grace_ck", sql`${t.legacyAccessUntil} is null or (${t.kind} = 'routine_retirement' and ${t.legacyAccessUntil} > ${t.effectiveAt})`),
]);

export const studentInstructionalSelections = pgTable("student_instructional_selections", {
  id: id(),
  sectionEnrollmentId: uuid("section_enrollment_id").notNull().references(() => enrollments.id, { onDelete: "restrict" }),
  trackVersionId: uuid("track_version_id").notNull().references(() => instructionalTrackVersions.id, { onDelete: "restrict" }),
  selectedByPersonId: uuid("selected_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  selectionSource: text("selection_source", { enum: ["student", "guardian", "approved_default", "authorized_assistance"] }).notNull(),
  revision: integer("revision").notNull(),
  requestId: uuid("request_id").notNull(),
  selectedAt: timestamp("selected_at", { withTimezone: true }).defaultNow().notNull(),
  supersededAt: timestamp("superseded_at", { withTimezone: true }),
  changeReason: text("change_reason"),
}, t => [
  uniqueIndex("student_instructional_selection_active_uq").on(t.sectionEnrollmentId).where(sql`${t.supersededAt} is null`),
  uniqueIndex("student_instructional_selection_revision_uq").on(t.sectionEnrollmentId, t.revision),
  uniqueIndex("student_instructional_selection_request_uq").on(t.sectionEnrollmentId, t.requestId),
  index("student_instructional_selection_track_idx").on(t.trackVersionId),
  index("student_instructional_selection_actor_idx").on(t.selectedByPersonId),
  check("student_instructional_selection_revision_ck", sql`${t.revision} > 0`),
  check("student_instructional_selection_source_ck", sql`${t.selectionSource} in ('student','guardian','approved_default','authorized_assistance')`),
  check("student_instructional_selection_time_ck", sql`${t.supersededAt} is null or ${t.supersededAt} >= ${t.selectedAt}`),
]);

// Practice progress is anchored to immutable activities, not a mutable current choice.
export const studentPracticeProgress = pgTable("student_practice_progress", {
  id: id(),
  sectionEnrollmentId: uuid("section_enrollment_id").notNull().references(() => enrollments.id, { onDelete: "restrict" }),
  trackActivityId: uuid("track_activity_id").notNull().references(() => instructionalTrackActivities.id, { onDelete: "restrict" }),
  status: text("status", { enum: ["in_progress", "completed"] }).default("in_progress").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("student_practice_progress_enrollment_activity_uq").on(t.sectionEnrollmentId, t.trackActivityId),
  index("student_practice_progress_enrollment_status_idx").on(t.sectionEnrollmentId, t.status),
  index("student_practice_progress_activity_idx").on(t.trackActivityId),
  check("student_practice_progress_attempt_ck", sql`${t.attemptCount} >= 0`),
  check("student_practice_progress_status_ck", sql`${t.status} in ('in_progress','completed')`),
  check("student_practice_progress_completion_ck", sql`(${t.status} = 'completed') = (${t.completedAt} is not null)`),
]);
