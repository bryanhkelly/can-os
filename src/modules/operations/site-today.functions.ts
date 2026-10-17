import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { and, asc, eq, inArray, gte, lt, ne, isNull, notExists, or } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, attendanceEvents, calendarEvents, calendarEventParticipants, enrollments, organizations, programs, sites } from "@/db/schema";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { AuthorizationError } from "@/domain/command-context";

const requestSchema = z.object({ siteId: z.string().uuid() });
const openStatuses = ["open", "in_progress", "waiting"] as const;

/** Site Today is a scoped read model, never another source of school state. */
export const getSiteToday = createServerFn({ method: "GET" })
  .validator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    if (!actor.actorPersonId || actor.role !== "registrar" ||
        !actor.scope.siteIds?.includes(data.siteId)) {
      throw new AuthorizationError("site.today.read");
    }
    const [site] = await db.select({
      id: sites.id, name: sites.name, timezone: sites.timezone,
      organizationId: sites.organizationId, organizationName: organizations.name,
    }).from(sites).innerJoin(organizations, eq(organizations.id, sites.organizationId))
      .where(eq(sites.id, data.siteId)).limit(1);
    if (!site || !actor.scope.organizationIds?.includes(site.organizationId)) {
      throw new AuthorizationError("site.today.read");
    }

    const visiblePrograms = await db.select({
      id: programs.id, name: programs.name, status: programs.status,
      type: programs.type, gradeRange: programs.gradeRange,
    }).from(programs).where(eq(programs.siteId, site.id)).orderBy(asc(programs.name));
    const permitted = new Set(actor.scope.programIds ?? []);
    const scopedPrograms = visiblePrograms.filter(p => permitted.has(p.id));
    const programIds = scopedPrograms.map(p => p.id);
    // Site-local day boundaries, including daylight-saving transitions.
    const now = new Date();
    const dayText = new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(now);
    // Filter calendar records using an intentionally broad UTC query range, then
    // perform exact site-local date matching. This avoids guessing a fixed offset.
    const start = new Date(now.getTime() - 36 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 36 * 60 * 60 * 1000);
    const localDate = (value: Date) => new Intl.DateTimeFormat("en-CA", {
      timeZone: site.timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).format(value);
    // Site Today is a shared screen: exclude private calendar entries, section-only
    // events, and events with an explicit participant audience.
    const hasParticipants = db.select({id:calendarEventParticipants.id})
      .from(calendarEventParticipants)
      .where(eq(calendarEventParticipants.calendarEventId,calendarEvents.id));
    const allowedProgram = programIds.length
      ? or(isNull(calendarEvents.programId),inArray(calendarEvents.programId,programIds))
      : isNull(calendarEvents.programId);
    const [actionRows, eventRows, attendanceRows, enrolledRows] = await Promise.all([
      db.select({
        id: actions.id, title: actions.title, description: actions.description,
        priority: actions.priority, status: actions.status, dueAt: actions.dueAt,
        programId: actions.programId, type: actions.type,
      }).from(actions)
        .where(and(eq(actions.siteId, site.id), inArray(actions.status, [...openStatuses])))
        .orderBy(asc(actions.dueAt)).limit(100),
      db.select({
        id: calendarEvents.id, title: calendarEvents.title, type: calendarEvents.type,
        startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt,
        programId: calendarEvents.programId,
      }).from(calendarEvents)
        .where(and(eq(calendarEvents.siteId, site.id), gte(calendarEvents.startsAt, start),
          lt(calendarEvents.startsAt, end),isNull(calendarEvents.sectionId),
          ne(calendarEvents.type,"personal"),ne(calendarEvents.type,"study_group"),notExists(hasParticipants),allowedProgram))
        .orderBy(asc(calendarEvents.startsAt)).limit(200),
      programIds.length ? db.select({
        id: attendanceEvents.id, programId: attendanceEvents.programId,
        studentProfileId: attendanceEvents.studentProfileId, status: attendanceEvents.status,
        expectedAt: attendanceEvents.expectedAt, occurrenceKey: attendanceEvents.occurrenceKey,
        recordedAt: attendanceEvents.recordedAt,
      }).from(attendanceEvents)
        .where(and(eq(attendanceEvents.siteId, site.id), inArray(attendanceEvents.programId, programIds),
          gte(attendanceEvents.expectedAt, start), lt(attendanceEvents.expectedAt, end)))
        .orderBy(asc(attendanceEvents.recordedAt)).limit(2000) : Promise.resolve([]),
      programIds.length ? db.select({
        studentProfileId: enrollments.studentProfileId, programId: enrollments.programId,
      }).from(enrollments).where(and(inArray(enrollments.programId, programIds),
        eq(enrollments.status, "active"), ne(enrollments.kind, "section"))) : Promise.resolve([]),
    ]);

    const filteredActions = actionRows.filter(row => !row.programId || permitted.has(row.programId));
    const todayEvents = eventRows.filter(row =>
      (!row.programId || permitted.has(row.programId)) && localDate(row.startsAt) === dayText);
    // Multiple revisions/section occurrences are not unique student attendance.
    // Display event status counts as recorded observations, not an attendance percentage.
    const todayAttendance = attendanceRows.filter(row => localDate(row.expectedAt) === dayText);
    const latest = new Map<string, (typeof todayAttendance)[number]>();
    for (const row of todayAttendance) {
      const key = `${row.studentProfileId}:${row.programId}:${row.occurrenceKey}`;
      const previous = latest.get(key);
      if (!previous || row.recordedAt >= previous.recordedAt) latest.set(key, row);
    }
    const observations = [...latest.values()];
    const enrollmentCount = new Set(enrolledRows.map(row => row.studentProfileId)).size;
    return {
      site, asOf: now.toISOString(), localDate: dayText,
      programs: scopedPrograms,
      enrollment: { count: enrollmentCount, note: "Distinct students in active non-section program enrollments" },
      attendance: {
        count: observations.length,
        present: observations.filter(row => row.status === "present").length,
        absent: observations.filter(row => row.status === "absent").length,
        tardy: observations.filter(row => row.status === "tardy").length,
        note: "Latest event per student, program and occurrence today; not a percent of expected students",
      },
      actions: filteredActions.map(row => ({
        ...row, dueAt: row.dueAt?.toISOString() ?? null,
      })),
      events: todayEvents.map(row => ({
        ...row, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null,
      })),
    };
  });
