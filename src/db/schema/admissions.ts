import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { applicationStage } from "./enums";
import { households, people, studentProfiles } from "./identity";
import { programs } from "./organizations";

export const applications = pgTable(
  "applications",
  {
    id: id(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "restrict" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    stage: applicationStage("stage").default("application").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    submittedByPersonId: uuid("submitted_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("application_idempotency_uq").on(table.idempotencyKey),
    index("application_household_idx").on(table.householdId),
    index("application_student_idx").on(table.studentProfileId),
    index("application_program_stage_idx").on(table.programId, table.stage),
  ],
);
