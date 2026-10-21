import { check, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "./common";
import { organizations } from "./organizations";
import { documents } from "./documents";
import { curriculumPackVersions } from "./curriculum-marketplace";
import { courseTemplateVersions } from "./academics";

/** Canonical reusable asset independent of any course, lesson, site or LMS interchange format. */
export const curriculumResources = pgTable("curriculum_resources", {
 id: id(),
 ownerOrganizationId: uuid("owner_organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 kind: text("kind").notNull(),
 title: text("title").notNull(),
 url: text("url"),
 documentId: uuid("document_id").references(()=>documents.id,{onDelete:"restrict"}),
 licenseCode: text("license_code").notNull(),
 attribution: text("attribution"),
 sourceUrl: text("source_url"),
 sourceFormat: text("source_format"),
 sourceIdentifier: text("source_identifier"),
 metadata: jsonb("metadata").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt: createdAt(), updatedAt: updatedAt(),
},t=>[
 index("curriculum_resources_owner_idx").on(t.ownerOrganizationId),
 index("curriculum_resources_source_idx").on(t.sourceFormat,t.sourceIdentifier),
 check("curriculum_resource_exactly_one_location_ck",
   sql`((${t.url} IS NOT NULL)::int + (${t.documentId} IS NOT NULL)::int) = 1`),
]);

/** Publisher-level immutable placement of a shared resource in a published pack/course. */
export const curriculumResourceBindings=pgTable("curriculum_resource_bindings",{
 id:id(),
 resourceId:uuid("resource_id").notNull().references(()=>curriculumResources.id,{onDelete:"restrict"}),
 packVersionId:uuid("pack_version_id").notNull().references(()=>curriculumPackVersions.id,{onDelete:"restrict"}),
 courseTemplateVersionId:uuid("course_template_version_id").references(()=>courseTemplateVersions.id,{onDelete:"restrict"}),
 lessonId:text("lesson_id"),
 placement:text("placement").default("supplemental").notNull(),
 metadata:jsonb("metadata").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),
},t=>[
 index("curriculum_resource_binding_pack_idx").on(t.packVersionId),
 index("curriculum_resource_binding_course_idx").on(t.courseTemplateVersionId),
 uniqueIndex("curriculum_resource_binding_unique_idx").on(t.packVersionId,t.resourceId,t.courseTemplateVersionId,t.lessonId),
]);

/** Import provenance and loss reports survive transformations; no silent lossy rebuild. */
export const curriculumImportJobs=pgTable("curriculum_import_jobs",{
 id:id(),organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 format:text("format").notNull(),formatVersion:text("format_version").notNull(),
 sourceName:text("source_name").notNull(),sha256:text("sha256").notNull(),
 status:text("status").default("staged").notNull(),
 report:jsonb("report").$type<Record<string,unknown>>().default({}).notNull(),
 metadata:jsonb("metadata").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
 index("curriculum_import_jobs_org_idx").on(t.organizationId),
 uniqueIndex("curriculum_import_job_source_uq").on(t.organizationId,t.format,t.sha256),
]);

/** Bidirectional identity map for imported/exported CC, QTI, LTI, OneRoster and CASE objects. */
export const curriculumInteropMappings=pgTable("curriculum_interop_mappings",{
 id:id(),organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 importJobId:uuid("import_job_id").references(()=>curriculumImportJobs.id,{onDelete:"restrict"}),
 format:text("format").notNull(),sourceSystem:text("source_system").notNull(),
 externalIdentifier:text("external_identifier").notNull(),
 entityType:text("entity_type").notNull(),entityId:uuid("entity_id").notNull(),
 metadata:jsonb("metadata").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
 uniqueIndex("curriculum_interop_external_uq").on(t.organizationId,t.format,t.sourceSystem,t.externalIdentifier),
 index("curriculum_interop_internal_idx").on(t.entityType,t.entityId),
]);
