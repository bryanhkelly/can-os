import { sql } from "drizzle-orm";
import { check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { sites } from "./organizations";
import { siteRooms } from "./site-rooms";
import { people } from "./identity";
import { sections } from "./academics";

export const roomCoverageSchedules = pgTable("room_coverage_schedules", {
  id: id(), siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  roomId: uuid("room_id").notNull().references(() => siteRooms.id, { onDelete: "restrict" }),
  primaryPersonId: uuid("primary_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  backupPersonId: uuid("backup_person_id").references(() => people.id, { onDelete: "restrict" }),
  startsOn: date("starts_on").notNull(), endsOn: date("ends_on").notNull(),
  weekdays: jsonb("weekdays").$type<number[]>().notNull(),
  startsAtLocal: text("starts_at_local").notNull(), endsAtLocal: text("ends_at_local").notNull(),
  revision: integer("revision").notNull().default(1),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, t => [
  index("room_coverage_site_idx").on(t.siteId),
  check("room_coverage_revision_positive", sql`${t.revision} > 0`),
  check("room_coverage_dates_ordered", sql`${t.startsOn} <= ${t.endsOn}`),
  check("room_coverage_date_range", sql`(${t.endsOn} - ${t.startsOn}) between 0 and 90`),
  check("room_coverage_weekdays_valid", sql`jsonb_typeof(${t.weekdays}) = 'array' and jsonb_array_length(${t.weekdays}) between 1 and 7 and ${t.weekdays} <@ '[0,1,2,3,4,5,6]'::jsonb`),
  check("room_coverage_clock_valid", sql`${t.startsAtLocal} ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$' and ${t.endsAtLocal} ~ '^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$'`),
  check("room_coverage_times_ordered", sql`${t.startsAtLocal} < ${t.endsAtLocal}`),
  check("room_coverage_distinct_adults", sql`${t.backupPersonId} is null or ${t.primaryPersonId} <> ${t.backupPersonId}`),
]);

export const roomCoverageSections = pgTable("room_coverage_sections", {
  coverageId: uuid("coverage_id").notNull().references(() => roomCoverageSchedules.id, { onDelete: "restrict" }),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
}, t => [primaryKey({ columns: [t.coverageId, t.sectionId] }), index("room_coverage_section_idx").on(t.sectionId)]);
