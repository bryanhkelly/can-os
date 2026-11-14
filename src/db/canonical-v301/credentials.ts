import { integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
const id = () => uuid("id").defaultRandom().primaryKey();

/** Mirrors the opt-in v3.0.1 credential patch; SQL owns triggers/RLS. */
export const credentialDefinitions = educationV30.table("credential_definitions", {
  id: id(), issuerOrganizationId: uuid("issuer_organization_id").notNull(),
  code: text("code").notNull(),
  kind: text("kind").$type<"completion_certificate" | "digital_badge">().notNull(),
  sourceKind: text("source_kind").$type<"noncredit_completion" | "verified_activity">().notNull(),
});
export const credentialDefinitionVersions = educationV30.table("credential_definition_versions", {
  id: id(), definitionId: uuid("definition_id").notNull(), versionNo: integer("version_no").notNull(),
  title: text("title").notNull(), description: text("description").notNull().default(""),
  minimumVerifiedMinutes: integer("minimum_verified_minutes").notNull().default(0),
  lifecycle: text("lifecycle").$type<"draft" | "published" | "retired">().notNull().default("draft"),
  approvedByPersonId: uuid("approved_by_person_id"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});
export const learnerAchievementDecisions = educationV30.table("learner_achievement_decisions", {
  id: id(), credentialDefinitionVersionId: uuid("credential_definition_version_id").notNull(),
  recipientPersonId: uuid("recipient_person_id").notNull(),
  noncreditCompletionDecisionId: uuid("noncredit_completion_decision_id"),
  activityEvidenceVersionId: uuid("activity_evidence_version_id"),
  decidedByPersonId: uuid("decided_by_person_id").notNull(),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});
export const credentialIssuances = educationV30.table("credential_issuances", {
  id: id(), achievementDecisionId: uuid("achievement_decision_id").notNull(),
  issuerOrganizationId: uuid("issuer_organization_id").notNull(),
  legacyNoncreditCertificateId: uuid("legacy_noncredit_certificate_id"),
  credentialReference: text("credential_reference").notNull(),
  issuedByPersonId: uuid("issued_by_person_id").notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});
export const credentialIssuanceEvents = educationV30.table("credential_issuance_events", {
  id: id(), issuanceId: uuid("issuance_id").notNull(),
  eventKind: text("event_kind").$type<"revoked">().notNull(),
  reason: text("reason").notNull(), evidenceVersionId: uuid("evidence_version_id").notNull(),
  decidedByPersonId: uuid("decided_by_person_id").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
export const credentialArtifacts = educationV30.table("credential_artifacts", {
  id: id(), issuanceId: uuid("issuance_id").notNull(),
  format: text("format").$type<"pdf" | "badge_json" | "png">().notNull(),
  artifactVersion: integer("artifact_version").notNull(),
  storageReference: text("storage_reference").notNull(), sha256: text("sha256").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
});
