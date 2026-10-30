import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import {
  instructionalDayType,
  schoolYearStatus,
} from "./enums";
import { organizations, programs, sites } from "./organizations";

export const gradeScales = pgTable(
  "grade_scales",
  {
    id: id(),
    owningOrganizationId: uuid("owning_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    version: integer("version").notNull(),
    active: boolean("active").default(true).notNull(),
    configuration: jsonb("configuration")
      .$type<{
        entries: Array<{
          label: string;
          minPercent?: number;
          maxPercent?: number;
          gpaPoints?: number;
          passing?: boolean;
        }>;
      }>()
      .notNull(),
    effectiveFrom: date("effective_from"),
    effectiveThrough: date("effective_through"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("grade_scale_org_name_version_uq").on(
      table.owningOrganizationId,
      table.name,
      table.version,
    ),
    index("grade_scale_org_active_idx").on(
      table.owningOrganizationId,
      table.active,
    ),
  ],
);

export const schoolYears = pgTable(
  "school_years",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "restrict" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "restrict",
    }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    status: schoolYearStatus("status").default("draft").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    gradeScaleId: uuid("grade_scale_id")
      .notNull()
      .references(() => gradeScales.id, { onDelete: "restrict" }),
    timezone: text("timezone").default("America/Los_Angeles").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("school_year_scope_key_uq").on(
      table.organizationId,
      table.programId,
      table.siteId,
      table.key,
    ),
    index("school_year_org_status_idx").on(
      table.organizationId,
      table.status,
    ),
    index("school_year_program_status_idx").on(
      table.programId,
      table.status,
    ),
    index("school_year_site_status_idx").on(
      table.siteId,
      table.status,
    ),
  ],
);

export const terms = pgTable(
  "terms",
  {
    id: id(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("term_year_key_uq").on(table.schoolYearId, table.key),
    uniqueIndex("term_year_sequence_uq").on(
      table.schoolYearId,
      table.sequence,
    ),
    index("term_year_idx").on(table.schoolYearId),
  ],
);

export const gradingPeriods = pgTable(
  "grading_periods",
  {
    id: id(),
    termId: uuid("term_id")
      .notNull()
      .references(() => terms.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    sequence: integer("sequence").notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
    gradePostingOpensAt: timestamp("grade_posting_opens_at", {
      withTimezone: true,
    }),
    gradePostingClosesAt: timestamp("grade_posting_closes_at", {
      withTimezone: true,
    }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("grading_period_term_key_uq").on(table.termId, table.key),
    uniqueIndex("grading_period_term_sequence_uq").on(
      table.termId,
      table.sequence,
    ),
    index("grading_period_term_idx").on(table.termId),
  ],
);

export const academicCalendars = pgTable(
  "academic_calendars",
  {
    id: id(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    version: integer("version").default(1).notNull(),
    active: boolean("active").default(true).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_calendar_year_site_version_uq").on(
      table.schoolYearId,
      table.siteId,
      table.version,
    ),
    index("academic_calendar_year_active_idx").on(
      table.schoolYearId,
      table.active,
    ),
    index("academic_calendar_site_active_idx").on(
      table.siteId,
      table.active,
    ),
  ],
);

export const academicCalendarDays = pgTable(
  "academic_calendar_days",
  {
    id: id(),
    academicCalendarId: uuid("academic_calendar_id")
      .notNull()
      .references(() => academicCalendars.id, { onDelete: "cascade" }),
    calendarDate: date("calendar_date").notNull(),
    type: instructionalDayType("type").notNull(),
    title: text("title"),
    instructionalMinutes: integer("instructional_minutes"),
    notes: text("notes"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("academic_calendar_day_uq").on(
      table.academicCalendarId,
      table.calendarDate,
    ),
    index("academic_calendar_day_date_idx").on(table.calendarDate),
  ],
);

export const scheduleTemplates = pgTable(
  "schedule_templates",
  {
    id: id(),
    schoolYearId: uuid("school_year_id")
      .notNull()
      .references(() => schoolYears.id, { onDelete: "cascade" }),
    programId: uuid("program_id").references(() => programs.id, {
      onDelete: "restrict",
    }),
    siteId: uuid("site_id")
      .notNull()
      .references(() => sites.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    active: boolean("active").default(true).notNull(),
    effectiveFrom: date("effective_from").notNull(),
    effectiveThrough: date("effective_through"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("schedule_template_year_idx").on(table.schoolYearId),
    index("schedule_template_program_active_idx").on(
      table.programId,
      table.active,
    ),
    index("schedule_template_site_active_idx").on(
      table.siteId,
      table.active,
    ),
  ],
);

export const scheduleTemplatePeriods = pgTable(
  "schedule_template_periods",
  {
    id: id(),
    scheduleTemplateId: uuid("schedule_template_id")
      .notNull()
      .references(() => scheduleTemplates.id, { onDelete: "cascade" }),
    dayOfWeek: integer("day_of_week").notNull(),
    sequence: integer("sequence").notNull(),
    label: text("label").notNull(),
    startsAtLocal: time("starts_at_local").notNull(),
    endsAtLocal: time("ends_at_local").notNull(),
    type: text("type").default("instruction").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("schedule_period_template_day_sequence_uq").on(
      table.scheduleTemplateId,
      table.dayOfWeek,
      table.sequence,
    ),
    index("schedule_period_template_idx").on(table.scheduleTemplateId),
  ],
);
