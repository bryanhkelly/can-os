import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  academicCalendars,
  attendanceEvents,
  attendanceExcuses,
  deliveryArrangements,
  documents,
  enrollments,
  guardianRelationships,
  instructionalDays,
  memberships,
  people,
  programRegistrations,
  programs,
  roleAssignments,
  sections,
  sectionTeachers,
  sites,
  studentProfiles,
} from "@/db/schema";
import { requireCapability } from "@/modules/identity/functions";
import { AuthorizationError } from "@/modules/identity/command-context";
import { assertRecordWriteAllowed } from "@/platform/governance/record-governance";
import {
  listEffectiveAttendanceEvents,
  type EffectiveAttendanceEvent,
} from "@/modules/attendance/effective-events";
import {
  closeObsoleteAttendanceExcuse,
  markOnsiteAttendance,
  reviewAttendanceExcuse,
  submitAttendanceExcuse,
} from "@/modules/attendance/workflow-service";

type Ctx = Awaited<ReturnType<typeof requireCapability>>;
const uuid = z.string().uuid();

/** Staff attendance requires the explicit workflow capability. */
async function staff(capability: string) {
  const actor = await requireCapability(capability);
  if (!actor.actorPersonId) throw new AuthorizationError("staff attendance actor");
  return actor;
}
async function guardian() {
  const actor = await requireCapability("attendance.excuse.submit");
  if (actor.role !== "guardian" || !actor.actorPersonId)
    throw new AuthorizationError("guardian attendance access");
  return actor;
}

/** Canonical onsite expectation: an active program enrollment whose program is onsite. */
async function expectedProgramEnrollments(date: string, siteIds: string[], programIds: string[]) {
  const onsitePrograms = await db.select({
    id: programs.id, name: programs.name, siteId: programs.siteId, organizationId: programs.organizationId,
  }).from(programs).where(and(
    inArray(programs.id, programIds), inArray(programs.siteId, siteIds),
    sql<boolean>"coalesce((" + programs.deliveryModel + ">>'onsite')::boolean, true)",
  ));
  if (!onsitePrograms.length) return [];
  const onsiteProgramIds = onsitePrograms.map(program => program.id);
  const programEnrollments = await db.select({
    id: enrollments.id, studentProfileId: enrollments.studentProfileId,
    programId: enrollments.programId, startsOn: enrollments.startsOn, endsOn: enrollments.endsOn,
  }).from(enrollments).where(and(
    eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
    inArray(enrollments.programId, onsiteProgramIds),
    lte(enrollments.startsOn, date),
    sql<boolean>"(" + enrollments.endsOn + " is null or " + enrollments.endsOn + " >= " + date + ")",
  ));
  const sectionsByProgram = new Map<string, string[]>();
  for (const program of onsitePrograms) {
    const sectionRows = await db.select({ id: sections.id }).from(sections)
      .where(and(eq(sections.programId, program.id),
        eq(sections.siteId, program.siteId), eq(sections.active, true)));
    sectionsByProgram.set(program.id, sectionRows.map(row => row.id));
  }
  return programEnrollments.map(enrollment => ({
    ...enrollment,
    program: onsitePrograms.find(program => program.id === enrollment.programId)!,
    sectionIds: sectionsByProgram.get(enrollment.programId) ?? [],
  }));
}

/** Programs with instructional time configured for the date (calendar + day types). */
async function instructionalProgramsForDate(date: string, siteIds: string[], programIds: string[]) {
  const year = date.slice(0, 4);
  const calendarRows = await db.select({
    id: academicCalendars.id, programId: academicCalendars.programId,
  }).from(academicCalendars).where(and(
    inArray(academicCalendars.programId, programIds),
    inArray(academicCalendars.siteId, siteIds),
    lte(academicCalendars.startsOn, `${year}-01-01`),
    gte(academicCalendars.endsOn, `${year}-12-31`),
  ));
  if (!calendarRows.length) return new Map<string, { status: string; dayType: string | null }>();
  const dayRows = await db.select({
    calendarId: instructionalDays.calendarId, date: instructionalDays.date,
    dayType: instructionalDays.dayType,
  }).from(instructionalDays).where(and(
    inArray(instructionalDays.calendarId, calendarRows.map(row => row.id)),
    eq(instructionalDays.date, date),
  ));
  const dayByCalendar = new Map(dayRows.map(row => [row.calendarId, row]));
  return new Map(calendarRows.map(row => [row.programId, {
    status: dayByCalendar.has(row.id) ? "scheduled" : "unscheduled",
    dayType: dayByCalendar.get(row.id)?.dayType ?? null,
  }]));
}

/** Whether a student is expected on site: program expectation intersected with enrollment window. */
async function resolveExpectedRoster(date: string, actor: Ctx, studentId?: string) {
  const siteIds = actor.scope.siteIds ?? [];
  const programIds = actor.scope.programIds ?? [];
  if (!siteIds.length || !programIds.length) return { students: [], programs: [] };
  const programEnrollments = await expectedProgramEnrollments(date, siteIds, programIds);
  const students = studentId
    ? programEnrollments.filter(enrollment => enrollment.studentProfileId === studentId)
    : programEnrollments;
  return { students, programs: [...new Map(programEnrollments.map(e => [e.programId, e.program])).values()] };
}

/**
 * Staff day view: the expected onsite roster with the current effective mark
 * for each student (correction chains collapsed) plus program configuration
 * warnings when calendar/scheduling prerequisites are missing.
 */
export const getOnsiteStaffDayContext = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), studentProfileId: uuid.optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.record");
    const { students, programs: onsitePrograms } = await resolveExpectedRoster(data.date, actor, data.studentProfileId);
    if (!students.length) return { programs: [], students: [] };
    const profileIds = [...new Set(students.map(e => e.studentProfileId))];
    const [profileRows, effectiveEvents, instructional] = await Promise.all([
      db.select({
        id: studentProfiles.id, personId: studentProfiles.personId,
        firstName: people.preferredName, legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
      }).from(studentProfiles)
        .innerJoin(people, eq(people.id, studentProfiles.personId))
        .where(inArray(studentProfiles.id, profileIds)),
      listEffectiveAttendanceEvents({ studentProfileIds: profileIds, date: data.date }),
      instructionalProgramsForDate(data.date, actor.scope.siteIds ?? [], actor.scope.programIds ?? []),
    ]);
    const eventByStudent = new Map(effectiveEvents.map(event => [event.studentProfileId, event]));
    return {
      programs: onsitePrograms.map(program => ({
        id: program.id, name: program.name,
        configuration: instructional.has(program.id)
          ? (instructional.get(program.id)!.dayType === "instructional" ? "configured" : "not_instructional")
          : "missing_calendar",
        missingCalendarDates: instructional.has(program.id) ? 0 : 1,
      })),
      students: students.map(enrollment => {
        const profile = profileRows.find(row => row.id === enrollment.studentProfileId);
        const event = eventByStudent.get(enrollment.studentProfileId);
        return {
          studentProfileId: enrollment.studentProfileId,
          programId: enrollment.programId,
          studentName: profile ? (profile.firstName ?? `${profile.legalFirstName} ${profile.legalLastName}`) : "Student",
          programName: enrollment.program.name,
          sectionTitle: null as string | null,
          status: event?.status ?? "unmarked",
          attendanceEventId: event?.id ?? null,
        };
      }),
    };
  });

export const listExpectedOnsiteRoster = getOnsiteStaffDayContext;

/**
 * Record or correct a day's attendance mark. The mutation is idempotent on
 * mutationId and optimistic-locked on expectedPreviousEventId so offline
 * queues cannot silently overwrite a newer school record.
 */
export const markExpectedOnsiteAttendance = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    studentProfileId: uuid, programId: uuid,
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.enum(["present", "absent", "tardy"]),
    mutationId: uuid, note: z.string().max(2000).default(""),
    expectedPreviousEventId: uuid.nullish(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.record");
    const [program] = await db.select({
      id: programs.id, siteId: programs.siteId, organizationId: programs.organizationId,
    }).from(programs).where(eq(programs.id, data.programId)).limit(1);
    if (!program || !program.siteId || !actor.scope.siteIds?.includes(program.siteId) ||
      !actor.scope.programIds?.includes(program.id) ||
      !actor.scope.organizationIds?.includes(program.organizationId))
      throw new AuthorizationError("onsite attendance program scope");
    const [enrollment] = await db.select({ id: enrollments.id }).from(enrollments).where(and(
      eq(enrollments.studentProfileId, data.studentProfileId),
      eq(enrollments.programId, data.programId),
      eq(enrollments.kind, "program"), eq(enrollments.status, "active"),
    )).limit(1);
    if (!enrollment) throw new Error("Student is not actively enrolled in this program");
    const replay = await db.select({
      id: attendanceEvents.id,
      occurrenceKey: attendanceEvents.occurrenceKey,
      sectionId: attendanceEvents.sectionId,
      status: attendanceEvents.status,
      recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      eq(attendanceEvents.studentProfileId, data.studentProfileId),
      eq(attendanceEvents.programId, data.programId),
      eq(attendanceEvents.occurrenceKey, data.date),
    ));
    const [current] = effectiveAttendanceEvents(replay);
    if (current && data.expectedPreviousEventId !== undefined &&
      data.expectedPreviousEventId !== (current?.id ?? null))
      throw new Error("Attendance conflict: a newer school record exists. Refresh before correcting");
    const result = await markOnsiteAttendance(actor, {
      studentProfileId: data.studentProfileId,
      programId: data.programId,
      siteId: program.siteId,
      date: data.date,
      status: data.status,
      note: data.note || undefined,
      mutationId: data.mutationId,
    });
    return { attendanceEventId: result.attendanceEventId, status: data.status };
  });

/** Collapse a correction chain to the latest effective event per occurrence. */
function effectiveAttendanceEvents<T extends { id: string; recordedAt: Date }>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of [...events].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime())) {
    latest.set("latest", event);
  }
  return [...latest.values()];
}

/** Guardian read model: the student's effective absences with excuse state. */
export const listGuardianEffectiveAbsences = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ studentProfileId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await guardian();
    const [profile] = await db.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, data.studentProfileId)).limit(1);
    const [relation] = profile ? await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(and(
        eq(guardianRelationships.guardianPersonId, actor.actorPersonId!),
        eq(guardianRelationships.studentPersonId, profile.personId),
        eq(guardianRelationships.canViewAcademics, true))).limit(1) : [];
    if (!relation) throw new AuthorizationError("guardian cannot view this student");
    const rows = await db.select({
      id: attendanceEvents.id, status: attendanceEvents.status,
      occurrenceKey: attendanceEvents.occurrenceKey, expectedAt: attendanceEvents.expectedAt,
      recordedAt: attendanceEvents.recordedAt,
      programId: attendanceEvents.programId, programName: programs.name,
    }).from(attendanceEvents)
      .innerJoin(programs, eq(programs.id, attendanceEvents.programId))
      .where(and(
        eq(attendanceEvents.studentProfileId, data.studentProfileId),
        inArray(attendanceEvents.status, ["absent", "tardy"]),
        inArray(attendanceEvents.programId, actor.scope.programIds ?? []),
      )).orderBy(desc(attendanceEvents.recordedAt)).limit(100);
    const effective = new Set(effectiveAttendanceEvents(rows).map(row => row.id));
    const excuseRows = rows.length ? await db.select({
      id: attendanceExcuses.id, attendanceEventId: attendanceExcuses.attendanceEventId,
      status: attendanceExcuses.status, reason: attendanceExcuses.reason,
      reviewNote: attendanceExcuses.reviewNote,
      reviewedAt: attendanceExcuses.reviewedAt,
    }).from(attendanceExcuses).where(
      inArray(attendanceExcuses.attendanceEventId, rows.map(row => row.id))) : [];
    const excuseByEvent = new Map(excuseRows.map(row => [row.attendanceEventId, row]));
    return {
      absences: rows
        .filter(row => effective.has(row.id))
        .map(row => {
          const excuse = excuseByEvent.get(row.id);
          return {
            attendanceEventId: row.id, status: row.status,
            date: row.occurrenceKey, expectedAt: row.expectedAt?.toISOString() ?? null,
            programName: row.programName,
            history: rows
              .filter(other => other.occurrenceKey === row.occurrenceKey)
              .map(other => ({
                status: other.status, recordedAt: other.recordedAt.toISOString(),
                reviewedAt: row.reviewedAt?.toISOString() ?? null,
              })),
            excuse: excuse ? {
              excuseId: excuse.id, status: excuse.status, reason: excuse.reason,
              reviewNote: excuse.reviewNote,
              reviewedAt: excuse.reviewedAt?.toISOString() ?? null,
            } : null,
          };
        }),
    };
  });

export const submitEffectiveAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    attendanceEventId: uuid, reason: z.string().trim().min(3).max(2000),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await guardian();
    const [record] = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      occurrenceKey: attendanceEvents.occurrenceKey,
    }).from(attendanceEvents).where(
      eq(attendanceEvents.id, data.attendanceEventId)).limit(1);
    if (!record || !actor.scope.programIds?.includes(record.programId) ||
      !record.siteId || !actor.scope.siteIds?.includes(record.siteId))
      throw new AuthorizationError("guardian attendance occurrence");
    const [profile] = await db.select({ personId: studentProfiles.personId })
      .from(studentProfiles).where(eq(studentProfiles.id, record.studentProfileId)).limit(1);
    const [relation] = profile ? await db.select({ id: guardianRelationships.id })
      .from(guardianRelationships).where(and(
        eq(guardianRelationships.guardianPersonId, actor.actorPersonId!),
        eq(guardianRelationships.studentPersonId, profile.personId),
        eq(guardianRelationships.canViewAcademics, true),
        eq(guardianRelationships.canSubmitAttendanceExcuse, true))).limit(1) : [];
    if (!relation) throw new AuthorizationError("guardian cannot excuse this student");

    const events = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      eq(attendanceEvents.studentProfileId, record.studentProfileId),
      eq(attendanceEvents.programId, record.programId),
      eq(attendanceEvents.occurrenceKey, record.occurrenceKey)));
    const [effective] = effectiveAttendanceEvents(events);
    if (!effective || effective.id !== data.attendanceEventId ||
      !["absent", "tardy"].includes(effective.status))
      throw new Error("This attendance record was corrected. Refresh before submitting an excuse");
    const excuseId = await submitAttendanceExcuse(actor, data);
    return { excuseId };
  });

/**
 * Read and review the same current correction chain as a guardian sees.
 * The queue is scoped by the caller's school and teacher-section assignment,
 * unlike the legacy program-only pending-excuse aggregation.
 */
export const listExpectedPendingExcuses = createServerFn({ method: "GET" })
  .handler(async () => {
    const actor = await staff("attendance.excuse.review");
    const base = db.select({
      excuseId: attendanceExcuses.id,
      attendanceEventId: attendanceExcuses.attendanceEventId,
      documentIds: attendanceExcuses.documentIds,
      studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId,
      occurrenceKey: attendanceEvents.occurrenceKey,
      reason: attendanceExcuses.reason,
      submittedAt: attendanceExcuses.createdAt,
      eventStatus: attendanceEvents.status,
      expectedAt: attendanceEvents.expectedAt,
      preferredName: people.preferredName,
      legalFirstName: people.legalFirstName, legalLastName: people.legalLastName,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, attendanceEvents.studentProfileId))
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .innerJoin(programs, eq(programs.id, attendanceEvents.programId));
    const rows = actor.role === "teacher" ? await base
      .innerJoin(sectionTeachers, eq(sectionTeachers.sectionId, attendanceEvents.sectionId))
      .where(and(
        eq(attendanceExcuses.status, "submitted"),
        eq(sectionTeachers.personId, actor.actorPersonId!),
        inArray(attendanceEvents.programId, actor.scope.programIds!),
        inArray(attendanceEvents.siteId, actor.scope.siteIds!),
        inArray(programs.organizationId, actor.scope.organizationIds!),
      )).orderBy(attendanceExcuses.createdAt).limit(100) :
      await base.where(and(
        eq(attendanceExcuses.status, "submitted"),
        inArray(attendanceEvents.programId, actor.scope.programIds!),
        inArray(attendanceEvents.siteId, actor.scope.siteIds!),
        inArray(programs.organizationId, actor.scope.organizationIds!),
      )).orderBy(attendanceExcuses.createdAt).limit(100);
    if (!rows.length) return { excuses: [] };
    const events = await db.select({
      id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
      programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
      status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
    }).from(attendanceEvents).where(and(
      inArray(attendanceEvents.programId, [...new Set(rows.map(r => r.programId))]),
      inArray(attendanceEvents.studentProfileId, [...new Set(rows.map(r => r.studentProfileId))]),
      inArray(attendanceEvents.occurrenceKey, [...new Set(rows.map(r => r.occurrenceKey))]),
    ));
    const effective = new Map(effectiveAttendanceEvents(events).map(r =>
      [[r.studentProfileId, r.programId, r.occurrenceKey].join(":"), r]));
    // Only verified documents are surfaced to reviewers; the download itself
    // re-checks scope, verification and object-key policy server-side.
    const attachmentIds = [...new Set(rows.flatMap(r => r.documentIds))];
    const attachmentRows = attachmentIds.length ? await db.select({
      id: documents.id, fileName: documents.fileName,
    }).from(documents).where(and(
      inArray(documents.id, attachmentIds), isNotNull(documents.verifiedAt))) : [];
    const attachmentNameById = new Map(attachmentRows.map(row => [row.id, row.fileName]));
    return { excuses: rows.map(r => {
      const current = effective.get([r.studentProfileId, r.programId, r.occurrenceKey].join(":"));
      return {
        excuseId: r.excuseId, attendanceEventId: r.attendanceEventId,
        currentAttendanceEventId: current?.id ?? null,
        studentName: r.preferredName ?? r.legalFirstName + " " + r.legalLastName,
        expectedAt: r.expectedAt.toISOString(), eventStatus: current?.status ?? r.eventStatus,
        reason: r.reason, submittedAt: r.submittedAt.toISOString(),
        attachments: r.documentIds
          .filter(id => attachmentNameById.has(id))
          .map(id => ({ documentId: id, fileName: attachmentNameById.get(id)! })),
        canReview: current?.id === r.attendanceEventId &&
          (current?.status === "absent" || current?.status === "tardy"),
        canClose: actor.role === "registrar" && !!current && current.id !== r.attendanceEventId,
      };
    }) };
  });

export const closeStaleAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    excuseId: uuid, expectedCurrentEventId: uuid,
    reason: z.string().trim().min(10).max(2000), confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.excuse.review");
    if (actor.role !== "registrar") throw new AuthorizationError("registrar obsolete excuse closure");
    return closeObsoleteAttendanceExcuse(actor, data);
  });

export const reviewCurrentAttendanceExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    excuseId: uuid, decision: z.enum(["approved", "rejected"]),
    note: z.string().max(2000).optional(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await staff("attendance.excuse.review");
    const [record] = await db.select({
      attendanceEventId: attendanceExcuses.attendanceEventId,
      status: attendanceExcuses.status,
      programId: attendanceEvents.programId, siteId: attendanceEvents.siteId,
      sectionId: attendanceEvents.sectionId,
      studentProfileId: attendanceEvents.studentProfileId,
      occurrenceKey: attendanceEvents.occurrenceKey,
    }).from(attendanceExcuses)
      .innerJoin(attendanceEvents, eq(attendanceEvents.id, attendanceExcuses.attendanceEventId))
      .where(eq(attendanceExcuses.id, data.excuseId)).limit(1);
    if (!record || !record.siteId || !actor.scope.siteIds?.includes(record.siteId) ||
      !actor.scope.programIds?.includes(record.programId))
      throw new AuthorizationError("pending excuse and site/program grant");
    const [host] = await db.select({ organizationId: programs.organizationId })
      .from(programs).where(eq(programs.id, record.programId)).limit(1);
    if (!host || !actor.scope.organizationIds?.includes(host.organizationId))
      throw new AuthorizationError("excuse organization scope");
    if (actor.role === "teacher") {
      const [assignment] = record.sectionId ? await db.select({ id: sectionTeachers.id })
        .from(sectionTeachers).where(and(
          eq(sectionTeachers.sectionId, record.sectionId),
          eq(sectionTeachers.personId, actor.actorPersonId!))).limit(1) : [];
      if (!assignment) throw new AuthorizationError("teacher excuse section assignment");
    }
    // The stale-attendance guard applies only to a first decision; an
    // already-reviewed excuse falls through to the service's idempotent retry.
    if (record.status === "submitted") {
      const chain = await db.select({
        id: attendanceEvents.id, studentProfileId: attendanceEvents.studentProfileId,
        programId: attendanceEvents.programId, occurrenceKey: attendanceEvents.occurrenceKey,
        status: attendanceEvents.status, recordedAt: attendanceEvents.recordedAt,
      }).from(attendanceEvents).where(and(
        eq(attendanceEvents.studentProfileId, record.studentProfileId),
        eq(attendanceEvents.programId, record.programId),
        eq(attendanceEvents.occurrenceKey, record.occurrenceKey)));
      const [current] = effectiveAttendanceEvents(chain);
      if (!current || current.id !== record.attendanceEventId ||
        !["absent", "tardy"].includes(current.status))
        throw new Error("Attendance changed after the guardian's excuse. Reconcile the school mark before reviewing this excuse");
    }
    return reviewAttendanceExcuse(actor, {
      excuseId: data.excuseId, decision: data.decision,
      reviewNote: data.note?.trim() || undefined,
    });
  });
