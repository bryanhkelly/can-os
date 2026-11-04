import { index, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { organizations, programs, sites } from "./organizations";
import { publicAdmissionsInterests } from "./public-admissions-interests";

export const interestEvents = pgTable("interest_events", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  organizationId: uuid("organization_id").notNull().references(() => organizations.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  programId: uuid("program_id").notNull().references(() => programs.id, { onDelete: "restrict" }),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  kind: text("kind").notNull(),
  location: text("location").notNull().default(""),
  visibility: text("visibility").notNull(),
  status: text("status").notNull().default("published"),
  invitationTokenDigest: text("invitation_token_digest"),
  createdByPersonId: uuid("created_by_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("interest_events_request_uq").on(table.requestId),
  index("interest_events_program_status_idx").on(table.programId, table.status),
  index("interest_events_site_status_idx").on(table.siteId, table.status),
]);

export const interestEventRegistrations = pgTable("interest_event_registrations", {
  id: id(),
  requestId: uuid("request_id").notNull(),
  eventId: uuid("event_id").notNull().references(() => interestEvents.id, { onDelete: "restrict" }),
  publicInterestId: uuid("public_interest_id").notNull()
    .references(() => publicAdmissionsInterests.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("registered"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  uniqueIndex("interest_event_registrations_request_uq").on(table.requestId),
  uniqueIndex("interest_event_registrations_event_interest_uq").on(table.eventId, table.publicInterestId),
  index("interest_event_registrations_event_status_idx").on(table.eventId, table.status),
]);
