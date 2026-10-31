import { index, jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { people, studentProfiles } from "./identity";
import { organizations } from "./organizations";
import { transcriptIssuances } from "./report-cards";

/** Institution-owned, versioned requirements; approved versions are immutable. */
export const graduationRequirementSets = pgTable("graduation_requirement_sets", {
  id: id(),
  issuingOrganizationId: uuid("issuing_organization_id").notNull().references(() => organizations.id),
  academicYear: text("academic_year").notNull(),
  version: text("version").notNull(),
  requirements: jsonb("requirements").$type<Array<{subject:string;minimumUnits:number}>>().notNull(),
  approvedByPersonId: uuid("approved_by_person_id").notNull().references(() => people.id),
  approvedAt: timestamp("approved_at",{withTimezone:true}).defaultNow().notNull(),
  createdAt: createdAt(),
}, t => [uniqueIndex("graduation_requirements_issuer_year_version_uq").on(t.issuingOrganizationId,t.academicYear,t.version)]);

/** An immutable adjudication: never treat an advisory credit audit as a diploma. */
export const graduationDecisions = pgTable("graduation_decisions", {
  id: id(),
  studentProfileId: uuid("student_profile_id").notNull().references(() => studentProfiles.id),
  issuingOrganizationId: uuid("issuing_organization_id").notNull().references(() => organizations.id),
  requirementSetId: uuid("requirement_set_id").notNull().references(() => graduationRequirementSets.id),
  transcriptIssuanceId: uuid("transcript_issuance_id").notNull().references(() => transcriptIssuances.id),
  decision: text("decision").notNull(),
  audit: jsonb("audit").$type<Record<string,unknown>>().notNull(),
  decidedByPersonId: uuid("decided_by_person_id").notNull().references(() => people.id),
  decidedAt: timestamp("decided_at",{withTimezone:true}).defaultNow().notNull(),
  createdAt: createdAt(),
}, t => [index("graduation_decision_student_idx").on(t.studentProfileId)]);

/** Credential record is distinct from the adjudication and can be revoked. */
export const diplomaIssuances = pgTable("diploma_issuances", {
  id: id(),
  graduationDecisionId: uuid("graduation_decision_id").notNull().references(() => graduationDecisions.id),
  issuedByPersonId: uuid("issued_by_person_id").notNull().references(() => people.id),
  issuedAt: timestamp("issued_at",{withTimezone:true}).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at",{withTimezone:true}),
  revocationReason: text("revocation_reason"),
  createdAt: createdAt(),
}, t => [uniqueIndex("diploma_decision_once_uq").on(t.graduationDecisionId)]);
