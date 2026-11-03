import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { jurisdictions, organizations } from "./organizations";
import { courseTemplateVersions } from "./academics";
import { people } from "./identity";

/** Versioned state profile; drafts cannot silently change active policy. */
export const jurisdictionProfileVersions = pgTable("jurisdiction_profile_versions", {
  id: id(),
  jurisdictionId: uuid("jurisdiction_id").notNull().references(() => jurisdictions.id, { onDelete: "restrict" }),
  revision: text("revision").notNull(),
  status: text("status").default("draft").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  profile: jsonb("profile").$type<Record<string, unknown>>().default({}).notNull(),
  reviewOwnerPersonId: uuid("review_owner_person_id"),
  lastEditedByPersonId: uuid("last_edited_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  verifiedByPersonId: uuid("verified_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  verificationEvidence: jsonb("verification_evidence").$type<Record<string, unknown>>().default({}).notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  nextReviewAt: timestamp("next_review_at", { withTimezone: true }),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  contentSchemaVersion: text("content_schema_version").default("1").notNull(),
  verificationStatus: text("verification_status").default("unverified").notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  check("jurisdiction_profile_status_check", sql`${table.status} IN ('draft','in_review','published','archived')`),
  check("jurisdiction_profile_verification_status_check", sql`${table.verificationStatus} IN ('unverified','verified')`),
  uniqueIndex("jurisdiction_profile_revision_uq").on(table.jurisdictionId,table.revision),
  index("jurisdiction_profile_status_idx").on(table.jurisdictionId,table.status),
]);

/** Approval is independent of publication, funding, or delivery. */
export const curriculumJurisdictionApprovals = pgTable("curriculum_jurisdiction_approvals", {
  id: id(),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id,{onDelete:"restrict"}),
  jurisdictionId: uuid("jurisdiction_id").notNull().references(() => jurisdictions.id,{onDelete:"restrict"}),
  academicPurpose: text("academic_purpose").notNull(),
  status: text("status").notNull(),
  authorityOrganizationId: uuid("authority_organization_id").references(() => organizations.id,{onDelete:"restrict"}),
  evidence: jsonb("evidence").$type<Record<string,unknown>>().default({}).notNull(),
  effectiveAt: timestamp("effective_at",{withTimezone:true}),
  expiresAt: timestamp("expires_at",{withTimezone:true}),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  check("curriculum_jurisdiction_approval_status_check",
   sql`${table.status} IN ('not_evaluated','under_review','approved','conditionally_approved','not_approved','expired')`),
  uniqueIndex("curriculum_jurisdiction_approval_scope_uq").on(table.courseTemplateVersionId,table.jurisdictionId,table.academicPurpose),
  index("curriculum_jurisdiction_approval_jurisdiction_idx").on(table.jurisdictionId,table.status),
]);

/** Append-only attestations; profile edits invalidate the current gate but keep prior evidence. */
export const jurisdictionProfileVerificationDecisions = pgTable("jurisdiction_profile_verification_decisions", {
  id: id(),
  profileVersionId: uuid("profile_version_id").notNull()
   .references(() => jurisdictionProfileVersions.id, { onDelete: "restrict" }),
  reviewerPersonId: uuid("reviewer_person_id").notNull()
   .references(() => people.id, { onDelete: "restrict" }),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
}, table => [
  index("jurisdiction_profile_verification_decision_profile_idx").on(table.profileVersionId,table.createdAt),
]);
