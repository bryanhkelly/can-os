import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { organizations, programs, sites, jurisdictions } from "./organizations";
import { documents } from "./documents";

/** Personal history is person-owned and never conflated with a position or login role. */
export const personProfileDetails = pgTable("person_profile_details", {
  id: id(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  headline: text("headline"),
  biography: text("biography"),
  preferredContactMethod: text("preferred_contact_method"),
  visibility: text("visibility").default("internal").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("person_profile_details_person_uq").on(t.personId)]);

export const educationHistory = pgTable("education_history", {
  id: id(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  institutionName: text("institution_name").notNull(),
  institutionId: text("institution_id"),
  degreeType: text("degree_type"),
  fieldOfStudy: text("field_of_study"),
  graduationYear: integer("graduation_year"),
  completionStatus: text("completion_status").default("reported").notNull(),
  verificationStatus: text("verification_status").default("unverified").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByPersonId: uuid("verified_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id, { onDelete: "restrict" }),
  visibility: text("visibility").default("restricted").notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("education_history_person_idx").on(t.personId)]);

export const personCredentials = pgTable("person_credentials", {
  id: id(),
  personId: uuid("person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  credentialType: text("credential_type").notNull(), // cpr, first_aid, teaching_license, clearance, training, etc.
  name: text("name").notNull(),
  issuer: text("issuer"),
  jurisdictionId: uuid("jurisdiction_id").references(() => jurisdictions.id, { onDelete: "restrict" }),
  issuedAt: timestamp("issued_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  verificationStatus: text("verification_status").default("unverified").notNull(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  verifiedByPersonId: uuid("verified_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  evidenceDocumentId: uuid("evidence_document_id").references(() => documents.id, { onDelete: "restrict" }),
  visibility: text("visibility").default("restricted").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("person_credential_person_type_idx").on(t.personId,t.credentialType),index("person_credential_expiry_idx").on(t.expiresAt)]);

/** Requirements belong to a policy/version/scope, not a hard-coded national checklist. */
export const complianceRequirements = pgTable("compliance_requirements", {
  id: id(),
  organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
  jurisdictionId: uuid("jurisdiction_id").references(() => jurisdictions.id, { onDelete: "restrict" }),
  authorityName: text("authority_name").notNull(),
  framework: text("framework").notNull(),
  frameworkVersion: text("framework_version").notNull(),
  code: text("code").notNull(),
  description: text("description").notNull(),
  evidenceType: text("evidence_type").notNull(),
  subjectType: text("subject_type").notNull(), // person, site, program, organization, section
  roleKeys: jsonb("role_keys").$type<string[]>().default([]).notNull(),
  requiredCredentialTypes: jsonb("required_credential_types").$type<string[]>().default([]).notNull(),
  mandatory: boolean("mandatory").default(true).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  effectiveThrough: timestamp("effective_through", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("compliance_req_scope_idx").on(t.organizationId,t.siteId,t.programId),index("compliance_req_framework_idx").on(t.framework,t.frameworkVersion)]);

export const complianceEvidence = pgTable("compliance_evidence", {
  id: id(),
  requirementId: uuid("requirement_id").notNull().references(() => complianceRequirements.id, { onDelete: "restrict" }),
  subjectType: text("subject_type").notNull(),
  subjectId: uuid("subject_id").notNull(),
  documentId: uuid("document_id").references(() => documents.id, { onDelete: "restrict" }),
  credentialId: uuid("credential_id").references(() => personCredentials.id, { onDelete: "restrict" }),
  sourceType: text("source_type").notNull(), // document, credential, operational_record
  sourceId: uuid("source_id"),
  status: text("status").default("submitted").notNull(),
  reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  reviewNote: text("review_note"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [index("compliance_evidence_requirement_idx").on(t.requirementId),index("compliance_evidence_subject_idx").on(t.subjectType,t.subjectId)]);

/** Configure existing canonical Programs, never spawn a competing school identity. */
export const schoolConfigurationVersions = pgTable("school_configuration_versions", {
  id: id(),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  deploymentModel: text("deployment_model").notNull(),
  status: text("status").default("draft").notNull(),
  config: jsonb("config").$type<{
    grades: { min: string; max: string };
    delivery: { onsite: boolean; asynchronous: boolean; liveOnline: boolean; onsiteDaysPerWeek?: number };
    responsibilities: Record<string, "host" | "can" | "partner">;
    services: string[];
    fundingModel?: string;
  }>().notNull(),
  approvedByPersonId: uuid("approved_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [uniqueIndex("school_configuration_program_version_uq").on(t.programId,t.version),index("school_configuration_status_idx").on(t.status)]);
