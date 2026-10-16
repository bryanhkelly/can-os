import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { assertSyntheticMutation, type DemoRole } from "../student-experience/demo-write-gate";

/**
 * GF4 attendance loop. Actors always derive from the verified server session
 * (getCommandContext); client-supplied IDs are only resource identifiers and are
 * re-checked against relationship and site/program scope on every call.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

type AttendanceStatus = "present" | "absent" | "tardy";

function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) throw new Error("Invalid attendance date");
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/** Teachers and registrars run site attendance; identity comes from the session. */
async function staffActor(capability: string) {
  const context = await getCommandContext(getRequest());
  assertCapability(context, capability);
  if (context.role !== "teacher" && context.role !== "registrar") {
    throw new AuthorizationError("staff attendance access");
  }
  if (!context.actorPersonId || !context.scope.siteIds?.length) {
    throw new AuthorizationError("staff site membership");
  }
  return context;
}

async function guardianActor() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "attendance.excuse.submit");
  if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length) {
    throw new AuthorizationError("guardian attendance access");
  }
  return context;
}

type RosterEntry = {
  studentProfileId: string;
  studentName: string;
  programId: string;
  siteId: string | null;
  sectionId: string | null;
  sectionTitle: string | null;
};

/** Active section enrollments plus program enrollments at the caller's scoped sites. */
async function loadScopedRoster(
  context: Awaited<ReturnType<typeof staffActor>>,
  studentProfileId?: string,
): Promise<RosterEntry[]> {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const siteIds = context.scope.siteIds!;
  const personName = {
    preferredName: s.people.preferredName,
    legalFirstName: s.people.legalFirstName,
    legalLastName: s.people.legalLastName,
  };
  const sectionRows = await db
    .select({
      studentProfileId: s.enrollments.studentProfileId,
      programId: s.sections.programId,
      siteId: s.sections.siteId,
      sectionId: s.sections.id,
      sectionTitle: s.sections.title,
      ...personName,
    })
    .from(s.enrollments)
    .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(and(
      eq(s.enrollments.kind, "section"),
      eq(s.enrollments.status, "active"),
      eq(s.sections.active, true),
      inArray(s.sections.siteId, siteIds),
      ...(studentProfileId ? [eq(s.enrollments.studentProfileId, studentProfileId)] : []),
    ));
  const programRows = await db
    .select({
      studentProfileId: s.enrollments.studentProfileId,
      programId: s.enrollments.programId,
      siteId: s.programs.siteId,
      ...personName,
    })
    .from(s.enrollments)
    .innerJoin(s.programs, eq(s.programs.id, s.enrollments.programId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(and(
      eq(s.enrollments.kind, "program"),
      eq(s.enrollments.status, "active"),
      inArray(s.programs.siteId, siteIds),
      ...(studentProfileId ? [eq(s.enrollments.studentProfileId, studentProfileId)] : []),
    ));
  const roster = new Map<string, RosterEntry>();
  for (const row of programRows) {
    if (!row.programId) continue;
    roster.set(row.studentProfileId, {
      studentProfileId: row.studentProfileId,
      studentName: row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`,
      programId: row.programId,
      siteId: row.siteId,
      sectionId: null,
      sectionTitle: null,
    });
  }
  for (const row of sectionRows) {
    roster.set(row.studentProfileId, {
      studentProfileId: row.studentProfileId,
      studentName: row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`,
      programId: row.programId,
      siteId: row.siteId,
      sectionId: row.sectionId,
      sectionTitle: row.sectionTitle,
    });
  }
  return [...roster.values()];
}

/** Students expected onsite for a date with their effective attendance status. */
export const listSiteAttendanceRoster = createServerFn({ method: "GET" })
  .validator((value: { date: string }) => value)
  .handler(async ({ data }) => {
    const context = await staffActor("attendance.write");
    if (!datePattern.test(data.date ?? "")) throw new Error("Date must be YYYY-MM-DD");
    const { start, end } = dayBounds(data.date);
    const roster = await loadScopedRoster(context);
    if (!roster.length) return { date: data.date, students: [] };
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const events = await db
      .select({
        id: s.attendanceEvents.id,
        studentProfileId: s.attendanceEvents.studentProfileId,
        status: s.attendanceEvents.status,
        occurrenceKey: s.attendanceEvents.occurrenceKey,
      })
      .from(s.attendanceEvents)
      .where(and(
        inArray(s.attendanceEvents.studentProfileId, roster.map(row => row.studentProfileId)),
        gte(s.attendanceEvents.expectedAt, start),
        lt(s.attendanceEvents.expectedAt, end),
      ))
      .orderBy(desc(s.attendanceEvents.recordedAt));
    const effective = new Map<string, (typeof events)[number]>();
    for (const event of events) {
      if (!effective.has(event.studentProfileId)) effective.set(event.studentProfileId, event);
    }
    return {
      date: data.date,
      students: roster
        .map(row => {
          const event = effective.get(row.studentProfileId);
          return {
            studentProfileId: row.studentProfileId,
            studentName: row.studentName,
            sectionTitle: row.sectionTitle,
            occurrenceKey: event?.occurrenceKey ?? `${data.date}:site-day`,
            attendanceEventId: event?.id ?? null,
            status: event?.status ?? "unmarked",
          };
        })
        .sort((a, b) => a.studentName.localeCompare(b.studentName)),
    };
  });

/** Mark a student present/absent/tardy; deterministic sourceKey keeps retries idempotent. */
export const markAttendance = createServerFn({ method: "POST" })
  .validator((value: { studentProfileId: string; date: string; status: AttendanceStatus }) => value)
  .handler(async ({ data }) => {
    const context = await staffActor("attendance.write");
    assertSyntheticMutation(context.role as DemoRole);
    if (!uuidPattern.test(data.studentProfileId ?? "")) throw new Error("Invalid student identifier");
    if (!datePattern.test(data.date ?? "")) throw new Error("Date must be YYYY-MM-DD");
    if (!["present", "absent", "tardy"].includes(data.status)) throw new Error("Invalid attendance status");
    const [enrollment] = await loadScopedRoster(context, data.studentProfileId);
    if (!enrollment) throw new AuthorizationError("active enrollment at your site");
    const { start } = dayBounds(data.date);
    const occurrenceKey = `${data.date}:site-day`;
    const { recordAttendance } = await import("./gf4-service");
    const attendanceEventId = await recordAttendance(context, {
      studentProfileId: enrollment.studentProfileId,
      programId: enrollment.programId,
      siteId: enrollment.siteId ?? undefined,
      sectionId: enrollment.sectionId ?? undefined,
      occurrenceKey,
      status: data.status,
      expectedAt: start,
      sourceKey: `manual:${enrollment.studentProfileId}:${occurrenceKey}`,
      metadata: { surface: "staff.attendance" },
    });
    return { attendanceEventId };
  });

/** Recent absences/tardies for students the verified guardian may view, plus excuse state. */
export const listGuardianAbsences = createServerFn({ method: "GET" }).handler(async () => {
  const context = await guardianActor();
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const relationships = await db
    .select({
      studentPersonId: s.guardianRelationships.studentPersonId,
      preferredName: s.people.preferredName,
      legalFirstName: s.people.legalFirstName,
      legalLastName: s.people.legalLastName,
    })
    .from(s.guardianRelationships)
    .innerJoin(s.people, eq(s.people.id, s.guardianRelationships.studentPersonId))
    .where(and(
      eq(s.guardianRelationships.guardianPersonId, context.actorPersonId!),
      eq(s.guardianRelationships.canViewAcademics, true),
    ));
  if (!relationships.length) return { absences: [] };
  const studentNames = new Map(
    relationships.map(row => [
      row.studentPersonId,
      row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`,
    ]),
  );
  const profiles = await db
    .select({ id: s.studentProfiles.id, personId: s.studentProfiles.personId })
    .from(s.studentProfiles)
    .where(inArray(s.studentProfiles.personId, relationships.map(row => row.studentPersonId)));
  if (!profiles.length) return { absences: [] };
  const profileToPerson = new Map(profiles.map(row => [row.id, row.personId]));
  const cutoff = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const events = await db
    .select({
      id: s.attendanceEvents.id,
      studentProfileId: s.attendanceEvents.studentProfileId,
      status: s.attendanceEvents.status,
      expectedAt: s.attendanceEvents.expectedAt,
    })
    .from(s.attendanceEvents)
    .where(and(
      inArray(s.attendanceEvents.studentProfileId, profiles.map(row => row.id)),
      inArray(s.attendanceEvents.status, ["absent", "tardy"]),
      gte(s.attendanceEvents.expectedAt, cutoff),
      inArray(s.attendanceEvents.programId, context.scope.programIds ?? []),
    ))
    .orderBy(desc(s.attendanceEvents.expectedAt))
    .limit(50);
  if (!events.length) return { absences: [] };
  const eventIds = events.map(row => row.id);
  const [excuses, corrections] = await Promise.all([
    db
      .select()
      .from(s.attendanceExcuses)
      .where(inArray(s.attendanceExcuses.attendanceEventId, eventIds))
      .orderBy(desc(s.attendanceExcuses.createdAt)),
    db
      .select({
        supersedesAttendanceEventId: s.attendanceEvents.supersedesAttendanceEventId,
        status: s.attendanceEvents.status,
      })
      .from(s.attendanceEvents)
      .where(inArray(s.attendanceEvents.supersedesAttendanceEventId, eventIds))
      .orderBy(desc(s.attendanceEvents.recordedAt)),
  ]);
  const latestExcuse = new Map<string, (typeof excuses)[number]>();
  for (const excuse of excuses) {
    if (!latestExcuse.has(excuse.attendanceEventId)) latestExcuse.set(excuse.attendanceEventId, excuse);
  }
  const effectiveStatus = new Map<string, string>();
  for (const correction of corrections) {
    if (correction.supersedesAttendanceEventId && !effectiveStatus.has(correction.supersedesAttendanceEventId)) {
      effectiveStatus.set(correction.supersedesAttendanceEventId, correction.status);
    }
  }
  return {
    absences: events.map(event => {
      const excuse = latestExcuse.get(event.id);
      return {
        attendanceEventId: event.id,
        studentPersonId: profileToPerson.get(event.studentProfileId) ?? "",
        studentName: studentNames.get(profileToPerson.get(event.studentProfileId) ?? "") ?? "Student",
        expectedAt: event.expectedAt.toISOString(),
        status: effectiveStatus.get(event.id) ?? event.status,
        originalStatus: event.status,
        excuse: excuse
          ? {
              excuseId: excuse.id,
              status: excuse.status,
              reason: excuse.reason,
              reviewNote: excuse.reviewNote,
              reviewedAt: excuse.reviewedAt?.toISOString() ?? null,
            }
          : null,
      };
    }),
  };
});

/** Guardians may excuse only events for students tied to their verified relationship. */
export const submitExcuse = createServerFn({ method: "POST" })
  .validator((value: { attendanceEventId: string; reason: string }) => value)
  .handler(async ({ data }) => {
    const context = await guardianActor();
    assertSyntheticMutation("guardian");
    if (!uuidPattern.test(data.attendanceEventId ?? "")) throw new Error("Invalid attendance event");
    const reason = (data.reason ?? "").trim();
    if (reason.length < 3 || reason.length > 2000) throw new Error("Reason must be 3-2,000 characters");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [record] = await db
      .select({ studentPersonId: s.studentProfiles.personId })
      .from(s.attendanceEvents)
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.attendanceEvents.studentProfileId))
      .where(eq(s.attendanceEvents.id, data.attendanceEventId))
      .limit(1);
    if (!record) throw new Error("AttendanceEvent not found");
    const [relationship] = await db
      .select({ id: s.guardianRelationships.id })
      .from(s.guardianRelationships)
      .where(and(
        eq(s.guardianRelationships.guardianPersonId, context.actorPersonId!),
        eq(s.guardianRelationships.studentPersonId, record.studentPersonId),
        eq(s.guardianRelationships.canViewAcademics, true),
      ))
      .limit(1);
    if (!relationship) throw new AuthorizationError("guardian attendance relationship");
    const { submitAttendanceExcuse } = await import("./gf4-service");
    const excuseId = await submitAttendanceExcuse(context, {
      attendanceEventId: data.attendanceEventId,
      reason,
    });
    return { excuseId };
  });

/** Submitted excuses awaiting review at the caller's scoped sites/programs. */
export const listPendingExcuses = createServerFn({ method: "GET" }).handler(async () => {
  const context = await staffActor("attendance.excuse.review");
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const rows = await db
    .select({
      excuseId: s.attendanceExcuses.id,
      attendanceEventId: s.attendanceExcuses.attendanceEventId,
      reason: s.attendanceExcuses.reason,
      submittedAt: s.attendanceExcuses.createdAt,
      eventStatus: s.attendanceEvents.status,
      expectedAt: s.attendanceEvents.expectedAt,
      preferredName: s.people.preferredName,
      legalFirstName: s.people.legalFirstName,
      legalLastName: s.people.legalLastName,
    })
    .from(s.attendanceExcuses)
    .innerJoin(s.attendanceEvents, eq(s.attendanceEvents.id, s.attendanceExcuses.attendanceEventId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.attendanceEvents.studentProfileId))
    .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
    .where(and(
      eq(s.attendanceExcuses.status, "submitted"),
      inArray(s.attendanceEvents.programId, context.scope.programIds ?? []),
    ))
    .orderBy(s.attendanceExcuses.createdAt)
    .limit(100);
  return {
    excuses: rows.map(row => ({
      excuseId: row.excuseId,
      attendanceEventId: row.attendanceEventId,
      studentName: row.preferredName ?? `${row.legalFirstName} ${row.legalLastName}`,
      expectedAt: row.expectedAt.toISOString(),
      eventStatus: row.eventStatus,
      reason: row.reason,
      submittedAt: row.submittedAt.toISOString(),
    })),
  };
});

/** Approve or reject a submitted excuse; approval writes a correcting AttendanceEvent. */
export const reviewExcuse = createServerFn({ method: "POST" })
  .validator((value: { excuseId: string; decision: "approved" | "rejected"; note?: string }) => value)
  .handler(async ({ data }) => {
    const context = await staffActor("attendance.excuse.review");
    assertSyntheticMutation(context.role as DemoRole);
    if (!uuidPattern.test(data.excuseId ?? "")) throw new Error("Invalid excuse identifier");
    if (data.decision !== "approved" && data.decision !== "rejected") throw new Error("Invalid review decision");
    const note = (data.note ?? "").trim();
    if (note.length > 2000) throw new Error("Review note must be under 2,000 characters");
    const { reviewAttendanceExcuse } = await import("./gf4-service");
    return reviewAttendanceExcuse(context, {
      excuseId: data.excuseId,
      decision: data.decision,
      reviewNote: note || undefined,
    });
  });
