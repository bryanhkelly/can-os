import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { organizations, programs, sites } from "./organizations";
import { documents } from "./documents";
import { actions } from "./work";

export const incidents = pgTable(
  "incidents",
  {
    id: id(),
    incidentNumber: text("incident_number").notNull(),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    status: text("status").default("filed").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
    reporterPersonId: uuid("reporter_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "restrict",
    }),
    locationText: text("location_text"),
    summary: text("summary").notNull(),
    immediateActions: text("immediate_actions"),
    classification: text("classification").default("safety_restricted").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByPersonId: uuid("closed_by_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incident_site_status_idx").on(table.siteId, table.status),
    index("incident_severity_idx").on(table.severity, table.status),
    index("incident_occurred_idx").on(table.occurredAt),
    uniqueIndex("incident_number_uq").on(table.incidentNumber),
  ],
);

export const incidentPeople = pgTable(
  "incident_people",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incident_people_incident_idx").on(table.incidentId),
    index("incident_people_person_idx").on(table.personId),
  ],
);

export const incidentReviews = pgTable(
  "incident_reviews",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    reviewerPersonId: uuid("reviewer_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    level: text("level").notNull(),
    status: text("status").default("pending").notNull(),
    decision: text("decision"),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incident_review_incident_idx").on(table.incidentId),
    index("incident_review_reviewer_status_idx").on(table.reviewerPersonId, table.status),
  ],
);

export const incidentNotifications = pgTable(
  "incident_notifications",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    recipientPersonId: uuid("recipient_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    recipientType: text("recipient_type").notNull(),
    recipientLabel: text("recipient_label"),
    channel: text("channel").notNull(),
    purpose: text("purpose").notNull(),
    status: text("status").default("pending").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("incident_notification_incident_idx").on(table.incidentId),
    index("incident_notification_recipient_idx").on(table.recipientPersonId),
  ],
);

export const incidentEvidence = pgTable(
  "incident_evidence",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "restrict",
    }),
    type: text("type").notNull(),
    description: text("description"),
    addedByPersonId: uuid("added_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
  },
  (table) => [index("incident_evidence_incident_idx").on(table.incidentId)],
);

export const incidentAmendments = pgTable(
  "incident_amendments",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    amendedByPersonId: uuid("amended_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    field: text("field").notNull(),
    priorValue: jsonb("prior_value"),
    newValue: jsonb("new_value"),
    reason: text("reason").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("incident_amendment_incident_idx").on(table.incidentId)],
);

export const incidentActions = pgTable(
  "incident_actions",
  {
    id: id(),
    incidentId: uuid("incident_id")
      .notNull()
      .references(() => incidents.id, { onDelete: "cascade" }),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("incident_action_uq").on(table.incidentId, table.actionId),
  ],
);
