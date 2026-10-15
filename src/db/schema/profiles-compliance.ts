import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { roleAssignments } from "./organizations";
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

/** Catalog identity is stable while specifications evolve. Different kinds can have distinct metadata and expiry policies. */
export const qualificationDefinitions = pgTable("qualification_definitions", {
 id:id(), key:text("key").notNull(), kind:text("kind").notNull(), title:text("title").notNull(),
 schemaVersion:integer("schema_version").default(1).notNull(),
 attributesSchema:jsonb("attributes_schema").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
}, t=>[uniqueIndex("qualification_definition_key_uq").on(t.key)]);

/** A Person makes a claim once, independent of employer or site. */
export const qualificationClaims = pgTable("qualification_claims", {
 id:id(),personId:uuid("person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 definitionId:uuid("definition_id").notNull().references(()=>qualificationDefinitions.id,{onDelete:"restrict"}),
 issuerName:text("issuer_name"),jurisdictionId:uuid("jurisdiction_id").references(()=>jurisdictions.id,{onDelete:"restrict"}),
 issuedAt:timestamp("issued_at",{withTimezone:true}),expiresAt:timestamp("expires_at",{withTimezone:true}),
 details:jsonb("details").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("qualification_claim_person_idx").on(t.personId),index("qualification_claim_definition_idx").on(t.definitionId)]);

/** Append-only decisions: effective status is derived from the latest valid sequence, never directly overwritten. */
export const qualificationVerificationEvents=pgTable("qualification_verification_events",{
 id:id(),claimId:uuid("claim_id").notNull().references(()=>qualificationClaims.id,{onDelete:"restrict"}),
 decision:text("decision").notNull(),actorPersonId:uuid("actor_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 evidenceDocumentId:uuid("evidence_document_id").references(()=>documents.id,{onDelete:"restrict"}),
 sourceProvider:text("source_provider"),sourceReference:text("source_reference"),
 reason:text("reason"),occurredAt:timestamp("occurred_at",{withTimezone:true}).defaultNow().notNull(),
 createdAt:createdAt(),
},t=>[index("qualification_verification_claim_time_idx").on(t.claimId,t.occurredAt)]);

/** Framework definitions are reused across locations, with immutable authored versions. */
export const complianceFrameworks=pgTable("compliance_frameworks",{
 id:id(),key:text("key").notNull(),name:text("name").notNull(),authority:text("authority").notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("compliance_framework_key_uq").on(t.key)]);
export const complianceFrameworkVersions=pgTable("compliance_framework_versions",{
 id:id(),frameworkId:uuid("framework_id").notNull().references(()=>complianceFrameworks.id,{onDelete:"restrict"}),
 version:text("version").notNull(),status:text("status").default("draft").notNull(),
 effectiveFrom:timestamp("effective_from",{withTimezone:true}),
 effectiveThrough:timestamp("effective_through",{withTimezone:true}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("compliance_framework_version_uq").on(t.frameworkId,t.version)]);
export const compliancePolicyRules=pgTable("compliance_policy_rules",{
 id:id(),frameworkVersionId:uuid("framework_version_id").notNull().references(()=>complianceFrameworkVersions.id,{onDelete:"restrict"}),
 code:text("code").notNull(),description:text("description").notNull(),
 expression:jsonb("expression").$type<Record<string,unknown>>().notNull(),
 evidencePolicy:jsonb("evidence_policy").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("compliance_policy_rule_code_uq").on(t.frameworkVersionId,t.code)]);
export const compliancePolicyApplicability=pgTable("compliance_policy_applicability",{
 id:id(),frameworkVersionId:uuid("framework_version_id").notNull().references(()=>complianceFrameworkVersions.id,{onDelete:"restrict"}),
 organizationId:uuid("organization_id").references(()=>organizations.id,{onDelete:"restrict"}),
 siteId:uuid("site_id").references(()=>sites.id,{onDelete:"restrict"}),
 programId:uuid("program_id").references(()=>programs.id,{onDelete:"restrict"}),
 jurisdictionId:uuid("jurisdiction_id").references(()=>jurisdictions.id,{onDelete:"restrict"}),
 roleKey:text("role_key"),effectiveFrom:timestamp("effective_from",{withTimezone:true}),
 effectiveThrough:timestamp("effective_through",{withTimezone:true}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("policy_applicability_program_idx").on(t.programId),index("policy_applicability_org_idx").on(t.organizationId)]);

/** Exceptions must have explicit policy/subject/authority/time bounds. */
export const compliancePolicyExceptions=pgTable("compliance_policy_exceptions",{
 id:id(),ruleId:uuid("rule_id").notNull().references(()=>compliancePolicyRules.id,{onDelete:"restrict"}),
 subjectType:text("subject_type").notNull(),subjectId:uuid("subject_id").notNull(),
 approvedByPersonId:uuid("approved_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 reason:text("reason").notNull(),evidenceDocumentId:uuid("evidence_document_id").references(()=>documents.id,{onDelete:"restrict"}),
 validFrom:timestamp("valid_from",{withTimezone:true}).notNull(),validThrough:timestamp("valid_through",{withTimezone:true}).notNull(),
 revokedAt:timestamp("revoked_at",{withTimezone:true}),createdAt:createdAt(),
},t=>[index("policy_exception_subject_idx").on(t.subjectType,t.subjectId)]);

/** Named accountable party and position, distinct from an abstract delivery-model enum. */
export const programResponsibilityAssignments=pgTable("program_responsibility_assignments",{
 id:id(),configurationVersionId:uuid("configuration_version_id").notNull().references(()=>schoolConfigurationVersions.id,{onDelete:"restrict"}),
 responsibilityKey:text("responsibility_key").notNull(),
 accountableOrganizationId:uuid("accountable_organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 responsibleRoleAssignmentId:uuid("responsible_role_assignment_id").references(()=>roleAssignments.id,{onDelete:"restrict"}),
 effectiveFrom:timestamp("effective_from",{withTimezone:true}),effectiveThrough:timestamp("effective_through",{withTimezone:true}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("program_responsibility_version_key_uq").on(t.configurationVersionId,t.responsibilityKey)]);

/** Eligibility is evaluated for a specific staff assignment under the applicable policy version. */
export const staffingEligibilityEvaluations=pgTable("staffing_eligibility_evaluations",{
 id:id(),roleAssignmentId:uuid("role_assignment_id").notNull().references(()=>roleAssignments.id,{onDelete:"restrict"}),
 policyRuleId:uuid("policy_rule_id").notNull().references(()=>compliancePolicyRules.id,{onDelete:"restrict"}),
 evaluatedAt:timestamp("evaluated_at",{withTimezone:true}).defaultNow().notNull(),
 result:text("result").notNull(),explanation:jsonb("explanation").$type<Record<string,unknown>>().default({}).notNull(),
 evidenceIds:jsonb("evidence_ids").$type<string[]>().default([]).notNull(),
 createdAt:createdAt(),
},t=>[index("staffing_eligibility_assignment_idx").on(t.roleAssignmentId,t.evaluatedAt)]);
