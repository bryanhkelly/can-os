import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizations } from "./organizations";
import { courseTemplateVersions, sections } from "./academics";
import { people } from "./identity";

/** LEGACY COMPATIBILITY ONLY (PR #140). No active API publishes per-class units.
 * Publisher-owned weeks belong inside a versioned course release. Preserve this
 * migrated table rather than dropping historical records or rewriting history. */
export const curriculumUnitVersions = pgTable("curriculum_unit_versions", {
  id: id(),
  owningOrganizationId: uuid("owning_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  baseCourseVersionId: uuid("base_course_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  unitKey: text("unit_key").notNull(),
  version: integer("version").notNull(),
  status: text("status").default("draft").notNull(),
  module: jsonb("module").$type<Record<string, unknown>>().notNull(),
  teacherGuide: jsonb("teacher_guide").$type<Record<string, unknown> | null>(),
  authoredByPersonId: uuid("authored_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  approvedByPersonId: uuid("approved_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("curriculum_unit_version_identity_uq").on(t.baseCourseVersionId, t.unitKey, t.version),
  index("curriculum_unit_status_idx").on(t.baseCourseVersionId, t.status),
]);

/** LEGACY COMPATIBILITY ONLY. Section delivery no longer reads this table.
 * Organization adoption selects a publisher course; teachers deliver it and
 * attach separate classroom supplements and assignments. */
export const sectionUnitAdoptions = pgTable("section_unit_adoptions", {
  id: id(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  baseCourseVersionId: uuid("base_course_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  unitKey: text("unit_key").notNull(),
  unitVersionId: uuid("unit_version_id").notNull().references(() => curriculumUnitVersions.id, { onDelete: "restrict" }),
  status: text("status").default("active").notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }),
  adoptedByPersonId: uuid("adopted_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  uniqueIndex("section_unit_adoption_identity_uq").on(t.sectionId, t.unitKey),
  index("section_unit_adoption_version_idx").on(t.unitVersionId),
]);
