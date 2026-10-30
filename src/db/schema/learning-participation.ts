import { check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, createdAt, updatedAt } from "./common";
import { courseTemplateVersions, sections, submissions } from "./academics";
import { people, studentProfiles } from "./identity";

export const lessonProgress = pgTable("lesson_progress", {
  id: id(),
  sectionId: uuid("section_id").notNull().references(() => sections.id, { onDelete: "restrict" }),
  courseTemplateVersionId: uuid("course_template_version_id").notNull().references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
  studentProfileId: uuid("student_profile_id").notNull().references(() => studentProfiles.id, { onDelete: "restrict" }),
  lessonId: text("lesson_id").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: createdAt(), updatedAt: updatedAt(),
}, table => [
  uniqueIndex("lesson_progress_student_section_version_lesson_uq").on(table.studentProfileId, table.sectionId, table.courseTemplateVersionId, table.lessonId),
  index("lesson_progress_section_student_idx").on(table.sectionId, table.studentProfileId),
]);

export const submissionAnnotations = pgTable("submission_annotations", {
  id: id(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "restrict" }),
  authorPersonId: uuid("author_person_id").notNull().references(() => people.id, { onDelete: "restrict" }),
  startOffset: integer("start_offset").notNull(),
  endOffset: integer("end_offset").notNull(),
  quote: text("quote").notNull(),
  comment: text("comment").notNull(),
  createdAt: createdAt(),
}, table => [
  index("submission_annotations_submission_idx").on(table.submissionId),
  check("submission_annotation_offsets_valid", sql`${table.startOffset} >= 0 and ${table.endOffset} > ${table.startOffset}`),
]);
