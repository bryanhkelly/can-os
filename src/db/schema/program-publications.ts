import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "./common";
import { people } from "./identity";
import { programs, sites } from "./organizations";

/**
 * Approved public marketing copy, separate from academic/launch/enrollment
 * status. Grades/delivery are snapshots reviewed by an authorized publisher.
 * A Site's own publication gate remains independent and mandatory.
 */
export const programPublications = pgTable("program_publications", {
  programId: uuid("program_id").primaryKey().references(() => programs.id, { onDelete: "restrict" }),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  gradeRange: jsonb("grade_range").$type<{ min: string; max: string }>().notNull(),
  deliveryModel: jsonb("delivery_model").$type<{
    onsite: boolean; asynchronous: boolean; liveOnline: boolean;
    onsiteDaysPerWeek: number | null;
  }>().notNull(),
  approvedByPersonId: uuid("approved_by_person_id").references(() => people.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index("program_publications_site_status_idx").on(table.siteId, table.status),
]);
