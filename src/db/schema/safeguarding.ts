import {
  boolean,
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
import { people, studentProfiles } from "./identity";
import { incidents } from "./incidents";
import { jurisdictions, sites } from "./organizations";

/**
 * Site-owned operational instructions. Activation records local operational
 * review only; it is not a legal determination or jurisdictional approval.
 */
export const safeguardingSitePolicies = pgTable(
  "safeguarding_site_policies",
  {
    id: id(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    jurisdictionId: uuid("jurisdiction_id")
      .notNull()
      .references(() => jurisdictions.id, { onDelete: "restrict" }),
    procedureVersion: text("procedure_version").notNull(),
    emergencyInstructions: text("emergency_instructions").notNull(),
    externalReportingInstructions: text("external_reporting_instructions").notNull(),
    offlineInstructions: text("offline_instructions").notNull(),
    acknowledgmentDueMinutes: integer("acknowledgment_due_minutes").notNull(),
    active: boolean("active").default(false).notNull(),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("safeguarding_site_policy_site_uq").on(table.siteId)],
);

/** Current named response roster. Intake snapshots recipients into case assignments. */
export const safeguardingSiteResponders = pgTable(
  "safeguarding_site_responders",
  {
    id: id(),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    responsibility: text("responsibility").notNull(),
    appointedByPersonId: uuid("appointed_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("safeguarding_site_responder_role_uq").on(table.siteId, table.responsibility),
    index("safeguarding_site_responder_person_idx").on(table.personId),
  ],
);

/** Safeguarding-specific facts around the canonical restricted Incident. */
export const safeguardingConcerns = pgTable(
  "safeguarding_concerns",
  {
    incidentId: uuid("incident_id")
      .primaryKey()
      .references(() => incidents.id, { onDelete: "cascade" }),
    reporterPersonId: uuid("reporter_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    studentProfileId: uuid("student_profile_id").references(() => studentProfiles.id, {
      onDelete: "restrict",
    }),
    concernKinds: jsonb("concern_kinds").$type<string[]>().notNull(),
    source: text("source").notNull(),
    immediateDanger: text("immediate_danger").notNull(),
    urgent: boolean("urgent").notNull(),
    policyVersion: text("policy_version").notNull(),
    acknowledgmentDueAt: timestamp("acknowledgment_due_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("safeguarding_concern_reporter_idempotency_uq").on(
      table.reporterPersonId,
      table.idempotencyKey,
    ),
    index("safeguarding_concern_student_idx").on(table.studentProfileId),
  ],
);

/** Need-to-know visibility is assigned per Incident, never inherited by Site. */
export const safeguardingCaseAssignments = pgTable(
  "safeguarding_case_assignments",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    responsibility: text("responsibility").notNull(),
    assignedByPersonId: uuid("assigned_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
  },
  (table) => [
    uniqueIndex("safeguarding_case_assignment_uq").on(
      table.incidentId,
      table.personId,
      table.responsibility,
    ),
    index("safeguarding_case_assignment_person_idx").on(table.personId, table.revokedAt),
    index("safeguarding_case_assignment_incident_idx").on(table.incidentId),
  ],
);

/**
 * Append-only attestation of an independent outside action. These records are
 * deliberately separate from internal notifications and acknowledgment.
 */
export const safeguardingExternalReports = pgTable(
  "safeguarding_external_reports",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    reporterPersonId: uuid("reporter_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    idempotencyKey: text("idempotency_key").notNull(),
    status: text("status").notNull(),
    agencyType: text("agency_type").notNull(),
    agencyLabel: text("agency_label").notNull(),
    channel: text("channel").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reference: text("reference"),
    details: text("details"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("safeguarding_external_report_idempotency_uq").on(
      table.incidentId,
      table.reporterPersonId,
      table.idempotencyKey,
    ),
    index("safeguarding_external_report_incident_idx").on(table.incidentId, table.occurredAt),
  ],
);
