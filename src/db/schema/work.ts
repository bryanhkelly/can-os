import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import {
  actionPriority,
  actionStatus,
  domainEventStatus,
  journeyRequirementStatus,
  journeyStatus,
  notificationStatus,
} from "./enums";
import { people } from "./identity";
import { organizations, programs, sites } from "./organizations";
import { sections } from "./academics";
import { journeyDefinitions } from "./journey-definitions";

export const actions = pgTable(
  "actions",
  {
    id: id(),
    type: text("type").notNull(),
    status: actionStatus("status").default("open").notNull(),
    priority: actionPriority("priority").default("normal").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    parentActionId: uuid("parent_action_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("action_owner_status_idx").on(table.ownerPersonId, table.status),
    index("action_subject_idx").on(table.subjectType, table.subjectId),
    index("action_program_status_idx").on(table.programId, table.status),
  ],
);

export const actionDependencies = pgTable(
  "action_dependencies",
  {
    id: id(),
    actionId: uuid("action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    blockedByActionId: uuid("blocked_by_action_id")
      .notNull()
      .references(() => actions.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    index("action_dependency_action_idx").on(table.actionId),
    index("action_dependency_blocker_idx").on(table.blockedByActionId),
  ],
);

export const journeys = pgTable(
  "journeys",
  {
    id: id(),
    type: text("type").notNull(),
    status: journeyStatus("status").default("not_started").notNull(),
    participantType: text("participant_type").notNull(),
    participantId: uuid("participant_id").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, {
      onDelete: "restrict",
    }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    journeyDefinitionId: uuid("journey_definition_id")
      .notNull()
      .references(() => journeyDefinitions.id, { onDelete: "restrict" }),
    definitionVersion: text("definition_version").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("journey_participant_idx").on(table.participantType, table.participantId),
    index("journey_program_idx").on(table.programId),
    index("journey_status_idx").on(table.status),
  ],
);

export const journeyRequirements = pgTable(
  "journey_requirements",
  {
    id: id(),
    journeyId: uuid("journey_id")
      .notNull()
      .references(() => journeys.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    status: journeyRequirementStatus("status").default("needs_you").notNull(),
    blocking: boolean("blocking").default(false).notNull(),
    ownerPersonId: uuid("owner_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("journey_requirement_journey_idx").on(table.journeyId),
    index("journey_requirement_status_idx").on(table.status, table.blocking),
  ],
);

export const domainEvents = pgTable(
  "domain_events",
  {
    id: id(),
    eventType: text("event_type").notNull(),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    actorPersonId: uuid("actor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
    status: domainEventStatus("status").default("pending").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    attempts: integer("attempts").default(0).notNull(),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("domain_event_status_idx").on(table.status, table.occurredAt),
    index("domain_event_aggregate_idx").on(table.aggregateType, table.aggregateId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: id(),
    actorPersonId: uuid("actor_person_id").references(() => people.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id").notNull(),
    scope: jsonb("scope").$type<Record<string, unknown>>().default({}).notNull(),
    before: jsonb("before").$type<Record<string, unknown>>(),
    after: jsonb("after").$type<Record<string, unknown>>(),
    context: jsonb("context").$type<Record<string, unknown>>().default({}).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_resource_idx").on(table.resourceType, table.resourceId),
    index("audit_actor_idx").on(table.actorPersonId, table.occurredAt),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    recipientPersonId: uuid("recipient_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: notificationStatus("status").default("unread").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    eventId: uuid("event_id").references(() => domainEvents.id, { onDelete: "set null" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("notification_recipient_status_idx").on(
      table.recipientPersonId,
      table.status,
    ),
  ],
);
