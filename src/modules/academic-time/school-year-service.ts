import { db } from "@/db/client";
import {
academicCalendarDays,
academicCalendars,
gradeScales,
gradingPeriods,
programs,
scheduleTemplatePeriods,
scheduleTemplates,
schoolYears,
sites,
terms,
} from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import {
assertCapability,
assertOrganizationScope,
assertProgramScope,
assertSiteScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,eq,isNull,sql } from "drizzle-orm";
import { schoolYearStructure } from "@/domain/school-year-structure";

type AcademicTimeTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
function withAcademicTimeTransaction<T>(run: (tx: AcademicTimeTransaction) => Promise<T>, tx?: AcademicTimeTransaction): Promise<T> {
  return tx ? run(tx) : db.transaction(run);
}

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
    siteId: string;
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
  assertSiteScope(context, input.siteId);
  assertDateRange(input.startsOn, input.endsOn, "SchoolYear");

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"school-year:" + input.organizationId + ":" + input.siteId + ":" + (input.programId ?? "site-wide") + ":" + input.key}))`);
    const [site] = await tx.select({organizationId:sites.organizationId}).from(sites)
      .where(eq(sites.id,input.siteId)).for("share").limit(1);
    if (!site || site.organizationId !== input.organizationId)
      throw new Error("Site must belong to SchoolYear organization");
    const [gradeScale] = await tx
      .select({ id: gradeScales.id, organizationId:gradeScales.owningOrganizationId,
        active:gradeScales.active })
      .from(gradeScales)
      .where(eq(gradeScales.id, input.gradeScaleId))
      .limit(1);

    if (!gradeScale || !gradeScale.active ||
        gradeScale.organizationId !== input.organizationId)
      throw new Error("Select an active grading scale owned by this school organization");

    if (input.programId) {
      const [program] = await tx
        .select({ organizationId: programs.organizationId, siteId:programs.siteId })
        .from(programs)
        .where(eq(programs.id, input.programId))
        .for("share")
        .limit(1);

      if (!program) throw new Error("Program not found");
      if (program.organizationId !== input.organizationId) {
        throw new Error("Program must belong to SchoolYear organization");
      }
      if (program.siteId !== input.siteId) throw new Error("Program must belong to SchoolYear Site");
    }

    const [existing] = await tx.select().from(schoolYears).where(and(
      eq(schoolYears.organizationId,input.organizationId),eq(schoolYears.siteId,input.siteId),
      input.programId ? eq(schoolYears.programId,input.programId) : isNull(schoolYears.programId),
      eq(schoolYears.key,input.key),
    )).limit(1);
    if (existing) {
      if (existing.name !== input.name || existing.startsOn !== input.startsOn ||
          existing.endsOn !== input.endsOn || existing.gradeScaleId !== input.gradeScaleId ||
          existing.timezone !== input.timezone)
        throw new Error("This school-year key already has different settings. Review the existing year instead of creating another.");
      return existing.id;
    }

    const [year] = await tx
      .insert(schoolYears)
      .values({
        organizationId: input.organizationId,
        programId: input.programId,
        siteId: input.siteId,
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

    await emitEvent(tx, {
      eventType: EventTypes.SchoolYearCreated,
      aggregateType: "school_year",
      aggregateId: year.id,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: input.organizationId,
        programId: input.programId ?? null,
        siteId: input.siteId,
      },
    });

    await writeAudit(tx, context, {
      action: "school_year.create",
      entityType: "school_year",
      entityId: year.id,
      scope: {
        organizationId: input.organizationId,
        programId: input.programId ?? null,
        siteId: input.siteId,
      },
      after: {
        key: input.key,
        startsOn: input.startsOn,
        endsOn: input.endsOn,
        status: "draft",
      },
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
  transaction?: AcademicTimeTransaction,
): Promise<string> {
  assertCapability(context, "academic_year.manage");
  assertDateRange(input.startsOn, input.endsOn, "Term");

  return withAcademicTimeTransaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, year.programId);
    assertSiteScope(context, year.siteId);

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
    const scope = { organizationId: year.organizationId, siteId: year.siteId, programId: year.programId };
    await writeAudit(tx, context, {
      action: "term.create", entityType: "term", entityId: term.id, scope, after: { ...input },
    });
    await emitEvent(tx, {
      eventType: EventTypes.TermCreated, aggregateType: "term", aggregateId: term.id,
      actorPersonId: context.actorPersonId, ...scope, payload: { schoolYearId: year.id },
    });
    return term.id;
  }, transaction);
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
  transaction?: AcademicTimeTransaction,
): Promise<string> {
  assertCapability(context, "academic_year.manage");
  assertDateRange(input.startsOn, input.endsOn, "GradingPeriod");

  return withAcademicTimeTransaction(async (tx) => {
    const [record] = await tx
      .select({
        termId: terms.id,
        termStartsOn: terms.startsOn,
        termEndsOn: terms.endsOn,
        organizationId: schoolYears.organizationId,
        programId: schoolYears.programId,
        siteId: schoolYears.siteId,
      })
      .from(terms)
      .innerJoin(schoolYears, eq(schoolYears.id, terms.schoolYearId))
      .where(eq(terms.id, input.termId))
      .limit(1);

    if (!record) throw new Error("Term not found");
    assertOrganizationScope(context, record.organizationId);
    assertProgramScope(context, record.programId);
    assertSiteScope(context, record.siteId);

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
    const scope = { organizationId: record.organizationId, siteId: record.siteId, programId: record.programId };
    await writeAudit(tx, context, {
      action: "grading_period.create", entityType: "grading_period", entityId: period.id, scope,
      after: {
        termId: input.termId, key: input.key, name: input.name, sequence: input.sequence,
        startsOn: input.startsOn, endsOn: input.endsOn,
        gradePostingOpensAt: input.gradePostingOpensAt?.toISOString() ?? null,
        gradePostingClosesAt: input.gradePostingClosesAt?.toISOString() ?? null,
      },
    });
    await emitEvent(tx, {
      eventType: EventTypes.GradingPeriodCreated, aggregateType: "grading_period", aggregateId: period.id,
      actorPersonId: context.actorPersonId, ...scope, payload: { termId: input.termId },
    });
    return period.id;
  }, transaction);
}

export async function createAcademicCalendar(
  context: CommandContext,
  input: {
    schoolYearId: string;
    name: string;
  },
  transaction?: AcademicTimeTransaction,
): Promise<string> {
  assertCapability(context, "academic_year.manage");

  return withAcademicTimeTransaction(async (tx) => {
    const [year] = await tx
      .select()
      .from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId))
      .limit(1);

    if (!year) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, year.organizationId);
    assertProgramScope(context, year.programId);
    assertSiteScope(context, year.siteId);
    await lockAttendanceConfigurationAtSite(tx, year.siteId);

    const [calendar] = await tx
      .insert(academicCalendars)
      .values({
        schoolYearId: input.schoolYearId,
        siteId: year.siteId,
        name: input.name,
        version: 1,
        active: true,
      })
      .returning({ id: academicCalendars.id });

    if (!calendar) throw new Error("Failed to create AcademicCalendar");
    await emitEvent(tx, {
      eventType: EventTypes.AcademicCalendarChanged,
      aggregateType: "academic_calendar",
      aggregateId: calendar.id,
      actorPersonId: context.actorPersonId,
      payload: { operation: "create", siteId: year.siteId,
        programId: year.programId ?? null, schoolYearId: year.id },
    });
    await writeAudit(tx, context, {
      action: "academic_calendar.create",
      entityType: "academic_calendar", entityId: calendar.id,
      scope: { organizationId: year.organizationId, programId: year.programId ?? null,
        siteId: year.siteId }, after: { version: 1, active: true },
    });
    return calendar.id;
  }, transaction);
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
        siteId: schoolYears.siteId,
        schoolYearId: schoolYears.id,
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
    assertSiteScope(context, record.siteId);

    if (
      input.calendarDate < record.startsOn ||
      input.calendarDate > record.endsOn
    ) {
      throw new Error("Calendar day must fit within SchoolYear");
    }
    await lockAttendanceConfigurationAtSite(tx, record.siteId);

    const [existing] = await tx
      .select({
        id: academicCalendarDays.id,
        type: academicCalendarDays.type,
        title: academicCalendarDays.title,
        instructionalMinutes: academicCalendarDays.instructionalMinutes,
        notes: academicCalendarDays.notes,
      })
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

    await emitEvent(tx, {
      eventType: EventTypes.AcademicCalendarChanged,
      aggregateType: "academic_calendar",
      aggregateId: input.academicCalendarId,
      actorPersonId: context.actorPersonId,
      organizationId: record.organizationId,
      siteId: record.siteId,
      programId: record.programId,
      payload: {
        operation: existing ? "update_day" : "create_day",
        schoolYearId: record.schoolYearId,
        calendarDate: input.calendarDate,
        type: input.type,
      },
    });
    await writeAudit(tx, context, {
      action: "academic_calendar.day.set",
      entityType: "academic_calendar_day",
      entityId: dayId,
      scope: {
        organizationId: record.organizationId,
        siteId: record.siteId,
        programId: record.programId,
      },
      before: existing ? {
        type: existing.type,
        title: existing.title,
        instructionalMinutes: existing.instructionalMinutes,
        notes: existing.notes,
      } : null,
      after: {
        calendarDate: input.calendarDate,
        type: input.type,
        title: input.title ?? null,
        instructionalMinutes: input.instructionalMinutes ?? null,
        notes: input.notes ?? null,
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
    assertSiteScope(context, year.siteId);

    if (
      input.effectiveFrom < year.startsOn ||
      (input.effectiveThrough && input.effectiveThrough > year.endsOn)
    ) {
      throw new Error("ScheduleTemplate must fit within SchoolYear");
    }
    await lockAttendanceConfigurationAtSite(tx, year.siteId);

    const [template] = await tx
      .insert(scheduleTemplates)
      .values({
        schoolYearId: input.schoolYearId,
        programId: input.programId ?? year.programId,
        siteId: year.siteId,
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
    await emitEvent(tx, {
      eventType: EventTypes.ScheduleTemplateChanged,
      aggregateType: "schedule_template", aggregateId: template.id,
      actorPersonId: context.actorPersonId,
      payload: { operation: "create", siteId: year.siteId,
        programId: input.programId ?? year.programId ?? null,
        schoolYearId: year.id, periodCount: input.periods.length },
    });
    await writeAudit(tx, context, {
      action: "schedule_template.create",
      entityType: "schedule_template", entityId: template.id,
      scope: { organizationId: year.organizationId, siteId: year.siteId,
        programId: input.programId ?? year.programId ?? null },
      after: { effectiveFrom: input.effectiveFrom,
        effectiveThrough: input.effectiveThrough ?? null,
        periodCount: input.periods.length },
    });

    return template.id;
  });
}

/** Prepare real draft records through their canonical commands. Locking the
 * year makes retries reuse its terms, periods and calendar without overwrites. */
export async function prepareSchoolYearBasics(
  context: CommandContext,
  input: {schoolYearId: string; structure: "full_year" | "semesters";
    instructionalDays?: {weekdays:number[];instructionalMinutes:number}},
) {
  assertCapability(context, "academic_year.manage");
  return db.transaction(async tx => {
    const [scoped] = await tx.select().from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId)).limit(1);
    if (!scoped) throw new Error("SchoolYear not found");
    assertOrganizationScope(context, scoped.organizationId);
    assertSiteScope(context, scoped.siteId);
    assertProgramScope(context, scoped.programId);
    // Use the same Site-before-row lock order as activation and attendance.
    await lockAttendanceConfigurationAtSite(tx, scoped.siteId);
    const [year] = await tx.select().from(schoolYears)
      .where(eq(schoolYears.id, input.schoolYearId)).for("update").limit(1);
    if (!year || year.siteId !== scoped.siteId) throw new Error("School year changed; refresh before preparing it");
    assertOrganizationScope(context, year.organizationId);
    assertSiteScope(context, year.siteId);
    assertProgramScope(context, year.programId);
    if (year.status !== "draft") throw new Error("Recommended setup is only available for a draft school year");
    const planned = schoolYearStructure(year.startsOn, year.endsOn, input.structure);
    let yearTerms = await tx.select({id:terms.id,name:terms.name,startsOn:terms.startsOn,endsOn:terms.endsOn})
      .from(terms).where(eq(terms.schoolYearId, year.id));
    const existingStructure = yearTerms.length > 0;
    if (!existingStructure) {
      yearTerms = [];
      for (const term of planned) {
        const termId = await createTerm(context, {...term, schoolYearId: year.id}, tx);
        yearTerms.push({id:termId,name:term.name,startsOn:term.startsOn,endsOn:term.endsOn});
      }
    }
    for (const term of yearTerms) {
      const [period] = await tx.select({id: gradingPeriods.id}).from(gradingPeriods)
        .where(eq(gradingPeriods.termId, term.id)).limit(1);
      if (!period) await createGradingPeriod(context, {
        termId:term.id,key:"term-grading",name:term.name,sequence:1,
        startsOn:term.startsOn,endsOn:term.endsOn,
      }, tx);
    }
    const [calendar] = await tx.select({id: academicCalendars.id}).from(academicCalendars)
      .where(and(eq(academicCalendars.schoolYearId, year.id), eq(academicCalendars.active, true))).limit(1);
    const calendarId = calendar?.id ?? await createAcademicCalendar(context, {
      schoolYearId:year.id,name:"Instructional calendar",
    }, tx);
    if (input.instructionalDays) await populateSchoolYearInstructionalDays(context, {
      academicCalendarId:calendarId,...input.instructionalDays,
    }, tx);
    return {schoolYearId:year.id,calendarId,existingStructure};
  });
}

/** The ordinary calendar generator is shared by launch preparation and the
 * detailed editor. Existing holidays, closures and scheduled days always win. */
export async function populateSchoolYearInstructionalDays(
  context:CommandContext,
  input:{academicCalendarId:string;weekdays:number[];instructionalMinutes:number},
  transaction?:AcademicTimeTransaction,
) {
  assertCapability(context,"academic_year.manage");
  if (!input.weekdays.length || input.weekdays.some(day=>!Number.isInteger(day)||day<0||day>6) ||
      !Number.isInteger(input.instructionalMinutes)||input.instructionalMinutes<1||input.instructionalMinutes>1440)
    throw new Error("Review instructional weekdays and minutes per day");
  return withAcademicTimeTransaction(async tx=>{
    const [calendar]=await tx.select({
      id:academicCalendars.id,startsOn:schoolYears.startsOn,endsOn:schoolYears.endsOn,
      programId:schoolYears.programId,siteId:schoolYears.siteId,organizationId:schoolYears.organizationId,
    }).from(academicCalendars).innerJoin(schoolYears,eq(schoolYears.id,academicCalendars.schoolYearId))
      .where(eq(academicCalendars.id,input.academicCalendarId)).limit(1);
    if(!calendar)throw new Error("Academic calendar not found");
    assertOrganizationScope(context,calendar.organizationId);
    assertSiteScope(context,calendar.siteId);
    assertProgramScope(context,calendar.programId);
    await lockAttendanceConfigurationAtSite(tx,calendar.siteId);
    const weekdays=new Set(input.weekdays);
    const rows:{academicCalendarId:string;calendarDate:string;type:"instructional";instructionalMinutes:number}[]=[];
    const end=Date.parse(calendar.endsOn+"T00:00:00Z");
    for(let at=Date.parse(calendar.startsOn+"T00:00:00Z");at<=end;at+=86400000){
      const instant=new Date(at);
      if(weekdays.has(instant.getUTCDay()))rows.push({academicCalendarId:calendar.id,
        calendarDate:instant.toISOString().slice(0,10),type:"instructional",instructionalMinutes:input.instructionalMinutes});
    }
    const created=rows.length ? await tx.insert(academicCalendarDays).values(rows)
      .onConflictDoNothing().returning({id:academicCalendarDays.id}) : [];
    if(created.length){
      await emitEvent(tx,{
        eventType:EventTypes.AcademicCalendarChanged,aggregateType:"academic_calendar",aggregateId:calendar.id,
        actorPersonId:context.actorPersonId,payload:{operation:"populate",weekdays:input.weekdays,
          scheduledDays:created.length,siteId:calendar.siteId},
      });
      await writeAudit(tx,context,{
        action:"academic_calendar.populate",entityType:"academic_calendar",entityId:calendar.id,
        scope:{organizationId:calendar.organizationId,siteId:calendar.siteId,programId:calendar.programId},
        after:{weekdays:input.weekdays,instructionalMinutes:input.instructionalMinutes,scheduledDays:created.length},
      });
    }
    return {processedDays:rows.length,createdDays:created.length};
  },transaction);
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
    assertSiteScope(context, year.siteId);

    // Even activation changes the eligible year set; a live attendance
    // transaction must never observe a half-activated site/year.
    await lockAttendanceConfigurationAtSite(tx, year.siteId);
    // Another registrar may have activated the year while we waited for
    // the site lock. Re-read after acquisition to avoid duplicate events.
    const [currentYear] = await tx.select({ status: schoolYears.status })
      .from(schoolYears).where(eq(schoolYears.id, schoolYearId)).limit(1);
    if (!currentYear) throw new Error("SchoolYear not found");
    if (currentYear.status === "active") return;

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
          eq(academicCalendars.siteId, year.siteId),
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
              eq(scheduleTemplates.siteId, year.siteId),
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

    await emitEvent(tx, {
      eventType: EventTypes.SchoolYearActivated,
      aggregateType: "school_year",
      aggregateId: schoolYearId,
      actorPersonId: context.actorPersonId,
      payload: {
        organizationId: year.organizationId,
        programId: year.programId ?? null,
        siteId: year.siteId,
      },
    });

    await writeAudit(tx, context, {
      action: "school_year.activate",
      entityType: "school_year",
      entityId: schoolYearId,
      scope: {
        organizationId: year.organizationId,
        programId: year.programId ?? null,
        siteId: year.siteId,
      },
      before: { status: year.status },
      after: { status: "active" },
    });
  });
}
