import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  academicCalendarDays,
  academicCalendars,
  auditEvents,
  domainEvents,
  gradeScales,
  gradingPeriods,
  programs,
  scheduleTemplatePeriods,
  scheduleTemplates,
  schoolYears,
  terms,
} from "@/db/schema";
import {
  assertCapability,
  assertOrganizationScope,
  assertProgramScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

function assertDateRange(startsOn: string, endsOn: string, label: string) {
  if (startsOn > endsOn) {
    throw new Error(`${label} start date must be on or before end date`);
  }
}

function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) {
  return aStart <= bEnd && bStart <= aEnd;
}

export async function createSchoolYear(
  context: CommandContext,
  input: {
    organizationId: string;
    programId?: string;
    key: string;
    name: string;
    startsOn: string;
    endsOn: string;
    gradeScaleId: string;
    timezone: string;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");
  assertOrganizationScope(context, input.organizationId);
  assertProgramScope(context, input.programId);
  assertDateRange(input.startsOn, input.endsOn, "SchoolYear");

  return db.transaction(async (tx) => {
    const [gradeScale] = await tx
      .select({ id: gradeScales.id })
      .from(gradeScales)
      .where(eq(gradeScales.id, input.gradeScaleId))
      .limit(1);

    if (!gradeScale) throw new Error("GradeScale not found");

    if (input.programId) {
      const [program] = await tx
        .select({ organizationId: programs.organizationId })
        .from(programs)
        .where(eq(programs.id, input.programId))
        .limit(1);

      if (!program) throw new Error("Program not found");
      if (program.organizationId !== input.organizationId) {
        throw new Error("Program must belong to SchoolYear organization");
      }
    }

    const [year] = await tx
      .insert(schoolYears)
      .values({
        organizationId: input.organizationId,
        programId: input.programId,
        key: input.key,
        name: input.name,
        status: "draft",
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        gradeScaleId: input.gradeScaleId,
        timezone: input.timezone,
      })
      .returning({ id: schoolYears.id });

    if (!year) throw new Error("Failed to create SchoolYear");

    await tx.insert(domainEvents).values({
      eventType: EventTypes.SchoolYearCreated,
      aggregateType: "school_year",
      aggregateId: year.id,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: input.organizationId,
        programId: input.programId ?? null,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "school_year.create",
      resourceType: "school_year",
      resourceId: year.id,
      scope: {
        organizationId: input.organizationId,
        programId: input.programId ?? null,
      },
      after: {
        key: input.key,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: "draft",
      },
      context: { requestId: context.requestId ?? null },
    });

    return year.id;
  });
}

export async function createTerm(
  context: CommandContext,
  input: {
    schoolYearId: string;
    key: string;
    name: string;
    sequence: number;
    startsOn: string;
    endsOn: string;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");
  assertDateRange(input.startsOn, input.endsOn, "Term");

  return db.transaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, year.programId);

    if (input.startsOn < year.startsOn || input.endsOn > year.endsOn) {
      throw new Error("Term must fit within SchoolYear");
    }

    const existingTerms = await tx
      .select({
        startsOn: terms.startsOn,
        endsOn: terms.endsOn,
      })
      .from(terms)
      .where(eq(terms.schoolYearId, input.schoolYearId));

    if (
      existingTerms.some((term) =>
        overlaps(input.startsOn, input.endsOn, term.startsOn, term.endsOn),
      )
    ) {
      throw new Error("Terms cannot overlap");
    }

    const [term] = await tx
      .insert(terms)
      .values({
        schoolYearId: input.schoolYearId,
        key: input.key,
        name: input.name,
        sequence: input.sequence,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
      })
      .returning({ id: terms.id });

    if (!term) throw new Error("Failed to create Term");
    return term.id;
  });
}

export async function createGradingPeriod(
  context: CommandContext,
  input: {
    termId: string;
    key: string;
    name: string;
    sequence: number;
    startsOn: string;
    endsOn: string;
    gradePostingOpensAt?: Date;
    gradePostingClosesAt?: Date;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");
  assertDateRange(input.startsOn, input.endsOn, "GradingPeriod");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        termId: terms.id,
        termStartsOn: terms.startsOn,
        termEndsOn: terms.endsOn,
        organizationId: schoolYears.organizationId,
        programId: schoolYears.programId,
      })
      .from(terms)
      .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
      .where(eq(terms.id, input.termId))
      .limit(1);

    if (!record) throw new Error("Term not found");
    assertOrganizationScope(context, record.organizationId);
    assertProgramScope(context, record.programId);

    if (
      input.startsOn < record.termStartsOn ||
      input.endsOn > record.termEndsOn
    ) {
      throw new Error("GradingPeriod must fit within Term");
    }

    const [period] = await tx
      .insert(gradingPeriods)
      .values({
        termId: input.termId,
        key: input.key,
        name: input.name,
        sequence: input.sequence,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        gradePostingOpensAt: input.gradePostingOpensAt,
        gradePostingClosesAt: input.gradePostingClosesAt,
      })
      .returning({ id: gradingPeriods.id });

    if (!period) throw new Error("Failed to create GradingPeriod");
    return period.id;
  });
}

export async function createAcademicCalendar(
  context: CommandContext,
  input: {
    schoolYearId: string;
    name: string;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");

  return db.transaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, year.programId);

    const [calendar] = await tx
      .insert(academicCalendars)
      .values({
        schoolYearId: input.schoolYearId,
        name: input.name,
        version: 1,
        active: true,
      })
      .returning({ id: academicCalendars.id });

    if (!calendar) throw new Error("Failed to create AcademicCalendar");
    return calendar.id;
  });
}

export async function setAcademicCalendarDay(
  context: CommandContext,
  input: {
    academicCalendarId: string;
    calendarDate: string;
    type: "instructional" | "holiday" | "closure" | "special" | "makeup";
    title?: string;
    instructionalMinutes?: number;
    notes?: string;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        yearId: schoolYears.id,
        startsOn: schoolYears.startsOn,
        endsOn: schoolYears.endsOn,
        organizationId: schoolYears.organizationId,
        programId: schoolYears.programId,
      })
      .from(academicCalendars)
      .innerJoin(
        schoolYears,
        eq(schoolYears.id, academicCalendars.schoolYearId),
      )
      .where(eq(academicCalendars.id, input.academicCalendarId))
      .limit(1);

    if (!record) throw new Error("AcademicCalendar not found");
    assertOrganizationScope(context, record.organizationId);
    assertProgramScope(context, record.programId);

    if (
      input.calendarDate < record.startsOn ||
      input.calendarDate > record.endsOn
    ) {
      throw new Error("Calendar day must fit within SchoolYear");
    }

    const [existing] = await tx
      .select({ id: academicCalendarDays.id })
      .from(academicCalendarDays)
      .where(
        and(
          eq(
            academicCalendarDays.academicCalendarId,
            input.academicCalendarId,
          ),
          eq(academicCalendarDays.calendarDate, input.calendarDate),
        ),
      )
      .limit(1);

    let dayId: string;

    if (existing) {
      await tx
        .update(academicCalendarDays)
        .set({
          type: input.type,
          title: input.title,
          instructionalMinutes: input.instructionalMinutes,
          notes: input.notes,
          updatedAt: new Date(),
        })
        .where(eq(academicCalendarDays.id, existing.id));
      dayId = existing.id;
    } else {
      const [day] = await tx
        .insert(academicCalendarDays)
        .values({
          academicCalendarId: input.academicCalendarId,
          calendarDate: input.calendarDate,
          type: input.type,
          title: input.title,
          instructionalMinutes: input.instructionalMinutes,
          notes: input.notes,
        })
        .returning({ id: academicCalendarDays.id });

      if (!day) throw new Error("Failed to create AcademicCalendarDay");
      dayId = day.id;
    }

    await tx.insert(domainEvents).values({
      eventType: EventTypes.AcademicCalendarChanged,
      aggregateType: "academic_calendar",
      aggregateId: input.academicCalendarId,
      actorPersonId: context.actorPersonId,
      payload: {
        calendarDate: input.calendarDate,
        type: input.type,
      },
    });

    return dayId;
  });
}

export async function createScheduleTemplate(
  context: CommandContext,
  input: {
    schoolYearId: string;
    programId?: string;
    name: string;
    effectiveFrom: string;
    effectiveThrough?: string;
    periods: Array<{
      dayOfWeek: number;
      sequence: number;
      label: string;
      startsAtLocal: string;
      endsAtLocal: string;
      type?: string;
    }>;
  },
): Promise<string> {
  assertCapability(context, "academic_year.manage");

  return db.transaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, input.programId ?? year.programId);

    if (
      input.effectiveFrom < year.startsOn ||
      (input.effectiveThrough && input.effectiveThrough > year.endsOn)
    ) {
      throw new Error("ScheduleTemplate must fit within SchoolYear");
    }

    const [template] = await tx
      .insert(scheduleTemplates)
      .values({
        schoolYearId: input.schoolYearId,
        programId: input.programId ?? year.programId,
        name: input.name,
        active: true,
        effectiveFrom: input.effectiveFrom,
        effectiveThrough: input.effectiveThrough,
      })
      .returning({ id: scheduleTemplates.id });

    if (!template) throw new Error("Failed to create ScheduleTemplate");

    if (input.periods.length > 0) {
      await tx.insert(scheduleTemplatePeriods).values(
        input.periods.map((period) => ({
          scheduleTemplateId: template.id,
          dayOfWeek: period.dayOfWeek,
          sequence: period.sequence,
          label: period.label,
          startsAtLocal: period.startsAtLocal,
          endsAtLocal: period.endsAtLocal,
          type: period.type ?? "instruction",
        })),
      );
    }

    return template.id;
  });
}

export async function activateSchoolYear(
  context: CommandContext,
  schoolYearId: string,
): Promise<void> {
  assertCapability(context, "academic_year.activate");

  await db.transaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, year.programId);

    if (year.status === "active") return;

    const yearTerms = await tx
      .select({ id: terms.id })
      .from(terms)
      .where(eq(terms.schoolYearId, schoolYearId));

    if (yearTerms.length === 0) {
      throw new Error("SchoolYear requires at least one Term");
    }

    for (const term of yearTerms) {
      const periods = await tx
        .select({ id: gradingPeriods.id })
        .from(gradingPeriods)
        .where(eq(gradingPeriods.termId, term.id));

      if (periods.length === 0) {
        throw new Error("Every Term requires at least one GradingPeriod");
      }
    }

    const [calendar] = await tx
      .select({ id: academicCalendars.id })
      .from(academicCalendars)
      .where(
        and(
          eq(academicCalendars.schoolYearId, schoolYearId),
          eq(academicCalendars.active, true),
        ),
      )
      .limit(1);

    if (!calendar) {
      throw new Error("SchoolYear requires an active AcademicCalendar");
    }

    if (year.programId) {
      const [program] = await tx
        .select({ deliveryModel: programs.deliveryModel })
        .from(programs)
        .where(eq(programs.id, year.programId))
        .limit(1);

      const delivery = program?.deliveryModel as
        | { onsite?: boolean }
        | undefined;

      if (delivery?.onsite) {
        const [schedule] = await tx
          .select({ id: scheduleTemplates.id })
          .from(scheduleTemplates)
          .where(
            and(
              eq(scheduleTemplates.schoolYearId, schoolYearId),
              eq(scheduleTemplates.active, true),
            ),
          )
          .limit(1);

        if (!schedule) {
          throw new Error(
            "Onsite SchoolYear requires an active ScheduleTemplate",
          );
        }
      }
    }

    const activatedAt = new Date();

    await tx
      .update(schoolYears)
      .set({ status: "active", updatedAt: activatedAt })
      .where(eq(schoolYears.id, schoolYearId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.SchoolYearActivated,
      aggregateType: "school_year",
      aggregateId: schoolYearId,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: year.organizationId,
        programId: year.programId ?? null,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: context.actorPersonId,
      action: "school_year.activate",
      resourceType: "school_year",
      resourceId: schoolYearId,
      scope: {
        organizationId: year.organizationId,
        programId: year.programId ?? null,
      },
      before: { status: year.status },
      after: { status: "active" },
      context: { requestId: context.requestId ?? null },
    });
  });
}
