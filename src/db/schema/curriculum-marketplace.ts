import { curriculumResources } from "./curriculum-resources";
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizations, programs, sites } from "./organizations";
import { courseTemplateVersions, sections } from "./academics";
import { documents } from "./documents";
import { people } from "./identity";

/** A pack is publisher-owned; installations never copy or transfer its authorship. */
export const curriculumPacks = pgTable("curriculum_packs", {
  id: id(),
  publisherOrganizationId: uuid("publisher_organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  visibility: text("visibility").default("private").notNull(),
  licenseCode: text("license_code").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex("curriculum_pack_publisher_slug_uq").on(table.publisherOrganizationId, table.slug),
  index("curriculum_pack_visibility_idx").on(table.visibility),
]);

export const curriculumPackVersions = pgTable("curriculum_pack_versions", {
  id: id(),
  packId: uuid("pack_id").notNull().references(() => curriculumPacks.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status").default("draft").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex("curriculum_pack_version_uq").on(table.packId, table.version),
]);

export const curriculumPackItems = pgTable("curriculum_pack_items", {
  id: id(),
  packVersionId: uuid("pack_version_id").notNull().references(() => curriculumPackVersions.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  position: integer("position").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
}, table => [
  uniqueIndex("curriculum_pack_item_version_course_uq").on(table.packVersionId, table.courseTemplateVersionId),
  uniqueIndex("curriculum_pack_item_order_uq").on(table.packVersionId, table.position),
]);

/** Entitlements are per organization; no learner or caller can self-grant one. */
export const curriculumEntitlements = pgTable("curriculum_entitlements", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  packId: uuid("pack_id").notNull().references(() => curriculumPacks.id, { onDelete: "restrict" }),
  status: text("status").default("active").notNull(),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
  acceptedByPersonId: uuid("accepted_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex("curriculum_entitlement_org_pack_uq").on(table.organizationId, table.packId),
]);

/** A program can adopt one active version of each pack; site is derived from the program. */
export const curriculumAdoptions = pgTable("curriculum_adoptions", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  packId: uuid("pack_id").notNull().references(() => curriculumPacks.id, { onDelete: "restrict" }),
  packVersionId: uuid("pack_version_id").notNull().references(() => curriculumPackVersions.id, { onDelete: "restrict" }),
  status: text("status").default("active").notNull(),
  adoptedByPersonId: uuid("adopted_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex("curriculum_adoption_program_pack_uq").on(table.programId, table.packId),
  index("curriculum_adoption_org_idx").on(table.organizationId),
]);

/** Separately versioned supplementation, never an edit to an immutable publisher release. */
export const curriculumOverlays = pgTable("curriculum_overlays", {
  id: id(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  lessonId: text("lesson_id"),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  url: text("url"),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "restrict" }),
  resourceId: uuid("resource_id").references(() => curriculumResources.id, { onDelete: "restrict" }),
  status: text("status").default("active").notNull(),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  index("curriculum_overlay_course_scope_idx").on(table.courseTemplateVersionId, table.programId),
  index("curriculum_overlay_section_idx").on(table.sectionId),
]);
