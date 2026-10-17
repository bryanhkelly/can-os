import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import {
  assessmentStatus,
  courseTemplateVersionStatus,
  enrollmentKind,
  enrollmentStatus,
  submissionStatus,
  submissionTimeliness,
} from "./enums";
import { people, studentProfiles } from "./identity";
import { organizations, programs, sites } from "./organizations";
import { schoolYears, scheduleTemplates, terms } from "./academic-time";

export const courseTemplates = pgTable(
  "course_templates",
  {
    id: id(),
    owningOrganizationId: uuid("owning_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    subject: text("subject").notNull(),
    description: text("description"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("course_template_org_code_uq").on(
      table.owningOrganizationId,
      table.code,
    ),
  ],
);

export const courseTemplateVersions = pgTable(
  "course_template_versions",
  {
    id: id(),
    courseTemplateId: uuid("course_template_id")
      .notNull()
      .references(() => courseTemplates.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    status: courseTemplateVersionStatus("status").default("draft").notNull(),
    curriculum: jsonb("curriculum").$type<Record<string, unknown>>().default({}).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("course_template_version_uq").on(
      table.courseTemplateId,
      table.version,
    ),
  ],
);

export const sections = pgTable(
  "sections",
  {
    id: id(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "restrict" }),
    siteId: uuid("site_id").references(() => sites.id, { onDelete: "restrict" }),
    courseTemplateVersionId: uuid("course_template_version_id")
      .notNull()
      .references(() => courseTemplateVersions.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    title: text("title").notNull(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "restrict" }),
    scheduleTemplateId: uuid("schedule_template_id").references(
      () => scheduleTemplates.id,
      { onDelete: "restrict" },
    ),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    active: boolean("active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("section_program_term_code_uq").on(
      table.programId,
      table.termId,
      table.code,
    ),
    index("section_program_idx").on(table.programId),
    index("section_term_idx").on(table.termId),
  ],
);

export const sectionTeachers = pgTable(
  "section_teachers",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    role: text("role").default("teacher").notNull(),
    assignmentSource: text("assignment_source").default("manual").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("section_teacher_uq").on(table.sectionId, table.personId),
    index("section_teacher_person_idx").on(table.personId),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    kind: enrollmentKind("kind").notNull(),
    status: enrollmentStatus("status").notNull(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, { onDelete: "restrict" }),
    sectionId: uuid("section_id").references(() => sections.id, { onDelete: "restrict" }),
    schoolYearId: uuid("school_year_id").references(() => schoolYears.id, {
      onDelete: "restrict",
    }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("enrollment_student_idx").on(table.studentProfileId),
    index("enrollment_program_idx").on(table.programId),
    index("enrollment_section_idx").on(table.sectionId),
    index("enrollment_status_idx").on(table.status),
    index("enrollment_school_year_idx").on(table.schoolYearId),
  ],
);

export const assessments = pgTable(
  "assessments",
  {
    id: id(),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    instructions: text("instructions"),
    status: assessmentStatus("status").default("draft").notNull(),
    pointsPossible: numeric("points_possible", { precision: 8, scale: 2 }),
    availableAt: timestamp("available_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdByPersonId: uuid("created_by_person_id")
      .notNull()
      .references(() => people.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("assessment_section_idx").on(table.sectionId),
    index("assessment_due_idx").on(table.dueAt),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: id(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => assessments.id, { onDelete: "restrict" }),
    studentProfileId: uuid("student_profile_id")
      .notNull()
      .references(() => studentProfiles.id, { onDelete: "restrict" }),
    status: submissionStatus("status").default("assigned").notNull(),
    timeliness: submissionTimeliness("timeliness").default("on_time").notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    gradedAt: timestamp("graded_at", { withTimezone: true }),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    score: numeric("score", { precision: 8, scale: 2 }),
    graderPersonId: uuid("grader_person_id").references(() => people.id, {
      onDelete: "restrict",
    }),
    response: jsonb("response").$type<Record<string, unknown>>().default({}).notNull(),
    feedback: jsonb("feedback").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("submission_attempt_uq").on(
      table.assessmentId,
      table.studentProfileId,
      table.attemptNumber,
    ),
    index("submission_student_idx").on(table.studentProfileId),
    index("submission_assessment_idx").on(table.assessmentId),
    index("submission_status_idx").on(table.status, table.timeliness),
  ],
);
