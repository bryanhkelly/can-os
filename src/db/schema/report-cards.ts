import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { sectionGradeStatus } from "./enums";
import { sections } from "./academics";
import { gradeScales, gradingPeriods, terms } from "./academic-time";
import { people, studentProfiles } from "./identity";
import { organizations } from "./organizations";

/**
 * Computed/finalizable academic result for a Student in a Section/GradingPeriod.
 * Immutability after finalization and the correction workflow are enforced in the
 * service layer; `correctionOfId` records append-only correction lineage.
 */
export const sectionGrades = pgTable(
  "section_grades",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "restrict" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    gradingPeriodId: uuid("grading_period_id")
      .notNull()
      .references(() => gradingPeriods.id, { onDelete: "restrict" }),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    status: sectionGradeStatus("status").default("draft").notNull(),
    score: numeric("score", { precision: 8, scale: 2 }),
    percentage: numeric("percentage", { precision: 8, scale: 2 }),
    letterGrade: text("letter_grade"),
    gradeScaleId: uuid("grade_scale_id").references(() => gradeScales.id, {
      onDelete: "restrict",
    }),
    finalizedByPersonId: uuid("finalized_by_person_id").references(
      () => people.id,
      { onDelete: "restrict" },
    ),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    correctionOfId: uuid("correction_of_id").references(
      (): AnyPgColumn => sectionGrades.id,
      { onDelete: "restrict" },
    ),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("section_grade_student_period_uq").on(
      table.sectionId,
      table.studentProfileId,
      table.gradingPeriodId,
    ),
    index("section_grade_section_idx").on(table.sectionId),
    index("section_grade_student_idx").on(table.studentProfileId),
    index("section_grade_grading_period_idx").on(table.gradingPeriodId),
    index("section_grade_term_idx").on(table.termId),
  ],
);

/**
 * An issued transcript artifact with issuer, timestamp, and a point-in-time
 * snapshot of the transcript payload. The issuer is the explicit
 * CreditIssuingOrganization, never assumed to be CAN.
 */
export const transcriptIssuances = pgTable(
  "transcript_issuances",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    issuedByPersonId: uuid("issued_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    issuingOrganizationId: uuid("issuing_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    purpose: text("purpose"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    snapshot: jsonb("snapshot")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("transcript_issuance_student_idx").on(table.studentProfileId),
    index("transcript_issuance_issuer_idx").on(table.issuingOrganizationId),
  ],
);
