import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { jurisdictions, organizations } from "./organizations";
import { courseTemplateVersions } from "./academics";

/** Versioned state profile; drafts cannot silently change active policy. */
export const jurisdictionProfileVersions = pgTable("jurisdiction_profile_versions", {
  id: id(),
  jurisdictionId: uuid("jurisdiction_id").notNull().references(() => jurisdictions.id, { onDelete: "restrict" }),
  revision: text("revision").notNull(),
  status: text("status").default("draft").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  profile: jsonb("profile").$type<Record<string, unknown>>().default({}).notNull(),
  evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
  effectiveAt: timestamp("effective_at", { withTimezone: true }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
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
  uniqueIndex("curriculum_jurisdiction_approval_scope_uq").on(table.courseTemplateVersionId,table.jurisdictionId,table.academicPurpose),
  index("curriculum_jurisdiction_approval_jurisdiction_idx").on(table.jurisdictionId,table.status),
]);
