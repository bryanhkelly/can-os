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

export const insights = pgTable(
  "insights",
  {
    id: id(),
    type: text("type").notNull(),
    status: text("status").default("open").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    evidence: jsonb("evidence").$type<Record<string, unknown>[]>().default([]).notNull(),
    uncertainty: text("uncertainty"),
    recommendedActions: jsonb("recommended_actions")
      .$type<Array<{ type: string; title: string; description?: string }>>()
      .default([])
      .notNull(),
    acknowledgedByPersonId: uuid("acknowledged_by_person_id").references(() => people.id, { onDelete: "set null" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("insight_subject_idx").on(table.subjectType, table.subjectId),
    index("insight_program_status_idx").on(table.programId, table.status),
  ],
);
