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
import { sections } from "./academics";

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: id(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: text("timezone").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    sourceType: text("source_type"),
    sourceId: uuid("source_id"),
    createdByPersonId: uuid("created_by_person_id").references(() => people.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("calendar_program_time_idx").on(table.programId, table.startsAt),
    index("calendar_site_time_idx").on(table.siteId, table.startsAt),
    index("calendar_source_idx").on(table.sourceType, table.sourceId),
  ],
);
