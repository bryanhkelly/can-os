import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { financialObligationStatus } from "./enums";
import { people, households } from "./identity";
import { sites } from "./organizations";
import { documents } from "./documents";

export const consentRecords = pgTable(
  "consent_records",
  {
    id: id(),
    householdId: uuid("household_id").references(() => households.id, {
      onDelete: "restrict",
    }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    consentType: text("consent_type").notNull(),
    signerPersonId: uuid("signer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    version: text("version").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    signatureEvidence: jsonb("signature_evidence")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("consent_subject_idx").on(table.subjectType, table.subjectId),
    index("consent_household_idx").on(table.householdId),
    index("consent_signer_idx").on(table.signerPersonId),
  ],
);

export const sensitiveAccessGrants = pgTable(
  "sensitive_access_grants",
  {
    id: id(),
    granteePersonId: uuid("grantee_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    purpose: text("purpose").notNull(),
    classification: text("classification").notNull(),
    allowedFields: jsonb("allowed_fields").$type<string[]>().default([]).notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    grantedByPersonId: uuid("granted_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("sensitive_access_grantee_idx").on(table.granteePersonId, table.validThrough),
    index("sensitive_access_resource_idx").on(table.resourceType, table.resourceId),
    index("sensitive_access_site_idx").on(table.siteId),
  ],
);

export const financialObligations = pgTable(
  "financial_obligations",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    type: text("type").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").default("USD").notNull(),
    status: financialObligationStatus("status").default("due").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    satisfiedAt: timestamp("satisfied_at", { withTimezone: true }),
    externalPaymentReference: text("external_payment_reference"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("financial_obligation_household_status_idx").on(table.householdId, table.status),
    index("financial_obligation_subject_idx").on(table.subjectType, table.subjectId),
  ],
);
