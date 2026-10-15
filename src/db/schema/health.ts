import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people, studentProfiles } from "./identity";
import { documents } from "./documents";
import { sites } from "./organizations";

export const healthProfiles = pgTable(
  "health_profiles",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    emergencySummary: text("emergency_summary"),
    allergySummary: text("allergy_summary"),
    accommodationSummary: text("accommodation_summary"),
    classification: text("classification").default("medical").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("health_profile_student_uq").on(table.studentProfileId),
  ],
);

export const healthComplianceItems = pgTable(
  "health_compliance_items",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    type: text("type").notNull(),
    status: text("status").default("missing").notNull(),
    dueOn: date("due_on"),
    expiresOn: date("expires_on"),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    reviewedByPersonId: uuid("reviewed_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("health_compliance_student_status_idx").on(table.studentProfileId, table.status),
    index("health_compliance_expiry_idx").on(table.expiresOn),
  ],
);

export const medicationAuthorizations = pgTable(
  "medication_authorizations",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    medicationName: text("medication_name").notNull(),
    instructions: text("instructions").notNull(),
    status: text("status").default("active").notNull(),
    startsOn: date("starts_on").notNull(),
    expiresOn: date("expires_on"),
    authorizationDocumentId: uuid("authorization_document_id").references(
      () => documents.id,
      { onDelete: "restrict" },
    ),
    guardianConsentDocumentId: uuid("guardian_consent_document_id").references(
      () => documents.id,
      { onDelete: "restrict" },
    ),
    emergencyOnly: boolean("emergency_only").default(false).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("medication_auth_student_status_idx").on(table.studentProfileId, table.status),
    index("medication_auth_expiry_idx").on(table.expiresOn),
  ],
);

export const medicationAdministrations = pgTable(
  "medication_administrations",
  {
    id: id(),
    authorizationId: uuid("authorization_id")
      .notNull()
      .references(() => medicationAuthorizations.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    administeredByPersonId: uuid("administered_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    administeredAt: timestamp("administered_at", { withTimezone: true }).defaultNow().notNull(),
    dose: text("dose"),
    result: text("result").default("administered").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (table) => [
    index("medication_admin_authorization_idx").on(table.authorizationId),
    index("medication_admin_site_time_idx").on(table.siteId, table.administeredAt),
  ],
);

export const healthOfficeVisits = pgTable(
  "health_office_visits",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).defaultNow().notNull(),
    checkedOutAt: timestamp("checked_out_at", { withTimezone: true }),
    reason: text("reason").notNull(),
    disposition: text("disposition"),
    sentHome: boolean("sent_home").default(false).notNull(),
    handledByPersonId: uuid("handled_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("health_visit_student_time_idx").on(table.studentProfileId, table.checkedInAt),
    index("health_visit_site_time_idx").on(table.siteId, table.checkedInAt),
  ],
);

export const returnToSchoolClearances = pgTable(
  "return_to_school_clearances",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    healthOfficeVisitId: uuid("health_office_visit_id").references(
      () => healthOfficeVisits.id,
      { onDelete: "restrict" },
    ),
    status: text("status").default("required").notNull(),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    clearedByPersonId: uuid("cleared_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("return_clearance_student_status_idx").on(table.studentProfileId, table.status),
  ],
);
