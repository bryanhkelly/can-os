import { pgTable } from "drizzle-orm/pg-core";
import { boolean, integer, timestamp, uuid } from "drizzle-orm/pg-core";
/** WS3 additive schema proposal. Migration owns the RLS, write triggers
 * and authoritative enrollment-time policy pin; NOT applied or enabled.
 */
export const classCompletionPolicyVersions=pgTable(
  "class_completion_policy_versions",{
    id:uuid("id").defaultRandom().primaryKey(),
    classId:uuid("class_id").notNull(),
    courseVersionId:uuid("course_version_id").notNull(),
    versionNo:integer("version_no").notNull(),
    requireAllLessons:boolean("require_all_lessons").notNull().default(false),
    requiredVerifiedSessions:integer("required_verified_sessions").notNull().default(0),
    requirePassingAssessment:boolean("require_passing_assessment").notNull().default(false),
    effectiveAt:timestamp("effective_at",{withTimezone:true}).notNull(),
    publishedAt:timestamp("published_at",{withTimezone:true}).notNull().defaultNow(),
    authoredByPersonId:uuid("authored_by_person_id").notNull(),
    approvedByPersonId:uuid("approved_by_person_id").notNull(),
    approvedPolicyEvidenceVersionId:uuid("approved_policy_evidence_version_id").notNull(),
  });
export const classEnrollmentCompletionPins=pgTable(
  "class_enrollment_completion_pins",{
    classEnrollmentId:uuid("class_enrollment_id").primaryKey(),
    classId:uuid("class_id").notNull(),
    courseVersionId:uuid("course_version_id").notNull(),
    completionPolicyVersionId:uuid("completion_policy_version_id").notNull(),
    pinnedAt:timestamp("pinned_at",{withTimezone:true}).notNull(),
  });
