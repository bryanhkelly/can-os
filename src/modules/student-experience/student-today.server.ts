/**
 * Database-backed Student Today read model.
 * Server-side composition only; not exported through a public route or called
 * from the demo UI until a real student session exists.
 */
import { and, asc, eq, gte, inArray, isNull, lt, ne, notExists, or } from "drizzle-orm";
import { db } from "@/db/client";
import { dateKeyInTimezone, dayBoundsInTimezone } from "@/modules/calendar/timezone";
import {
  actions, assessments, calendarEventParticipants, calendarEvents, enrollments,
  people, sections, scheduledOccurrences, schoolYears, sites, studentProfiles, submissions,
} from "@/db/schema";

export type StudentTodayData = Awaited<ReturnType<typeof getStudentToday>>;

export async function getStudentToday(studentProfileId: string, at = new Date(),
  scope?:{siteIds:string[];programIds:string[]}) {
  const [student] = await db
    .select({
      studentProfileId: studentProfiles.id,
      personId: people.id,
      firstName: people.legalFirstName,
      preferredName: people.preferredName,
      gradeLevel: studentProfiles.gradeLevel,
    })
    .from(studentProfiles)
    .innerJoin(people, eq(studentProfiles.personId, people.id))
    .where(eq(studentProfiles.id, studentProfileId))
    .limit(1);

  if (!student) throw new Error("Student not found");

  const activeSections = await db
    .select({
      sectionId: sections.id,
      sectionTitle: sections.title,
      siteId: sections.siteId,
      siteTimezone: sites.timezone,
      schoolYearTimezone: schoolYears.timezone,
      programId: sections.programId,
      schoolYearId: enrollments.schoolYearId,
    })
    .from(enrollments)
    .innerJoin(sections, eq(enrollments.sectionId, sections.id))
    .leftJoin(sites, eq(sections.siteId, sites.id))
    .leftJoin(schoolYears, eq(enrollments.schoolYearId, schoolYears.id))
    .where(and(
      eq(enrollments.studentProfileId, studentProfileId),
      eq(enrollments.kind, "section"),
      eq(enrollments.status, "active"),
      eq(sections.active, true),
      ...(scope?[inArray(sections.siteId,scope.siteIds),inArray(sections.programId,scope.programIds)]:[]),
    ));

  const sectionIds = activeSections.map((row) => row.sectionId);
  const siteIds = [...new Set(activeSections.map((row) => row.siteId).filter((id): id is string => Boolean(id)))];

  const startOfDay = new Date(at);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
  const dayRanges = new Map<string, {
    siteId: string | null;
    timezone: string;
    sectionIds: string[];
    start: Date;
    end: Date;
  }>();
  for (const section of activeSections) {
    const timezone = section.siteTimezone ?? section.schoolYearTimezone ?? "UTC";
    const key = `${section.siteId ?? "no-site"}:${timezone}`;
    let range = dayRanges.get(key);
    if (!range) {
      const bounds = dayBoundsInTimezone(at, timezone);
      range = { siteId: section.siteId, timezone, sectionIds: [], ...bounds };
      dayRanges.set(key, range);
    }
    range.sectionIds.push(section.sectionId);
  }
  const programIds = [...new Set(activeSections.map(section => section.programId))];
  const explicitParticipants = db.select({ id: calendarEventParticipants.id })
    .from(calendarEventParticipants)
    .where(eq(calendarEventParticipants.calendarEventId, calendarEvents.id));
  const participantEventIds = db.select({ id: calendarEventParticipants.calendarEventId })
    .from(calendarEventParticipants)
    .where(and(
      eq(calendarEventParticipants.participantType, "person"),
      eq(calendarEventParticipants.participantId, student.personId),
    ));
  const eventVisibility = or(
    sectionIds.length ? and(
      inArray(scheduledOccurrences.sectionId, sectionIds),
      or(isNull(scheduledOccurrences.siteId), inArray(scheduledOccurrences.siteId, siteIds)),
      or(isNull(scheduledOccurrences.programId), inArray(scheduledOccurrences.programId, programIds)),
      ne(calendarEvents.type, "study_group"),
      notExists(explicitParticipants),
    ) : undefined,
    siteIds.length ? and(
      isNull(scheduledOccurrences.sectionId),
      inArray(scheduledOccurrences.siteId, siteIds),
      or(isNull(scheduledOccurrences.programId), inArray(scheduledOccurrences.programId, programIds)),
      ne(calendarEvents.type, "personal"),
      ne(calendarEvents.type, "study_group"),
      notExists(explicitParticipants),
    ) : undefined,
    programIds.length ? and(
      isNull(scheduledOccurrences.sectionId),
      isNull(scheduledOccurrences.siteId),
      inArray(scheduledOccurrences.programId, programIds),
      ne(calendarEvents.type, "personal"),
      ne(calendarEvents.type, "study_group"),
      notExists(explicitParticipants),
    ) : undefined,
    and(
      ne(calendarEvents.type, "study_group"),
      inArray(calendarEvents.id, participantEventIds),
    ),
  );
  const eventCandidateStart = new Date(at.getTime() - 36 * 60 * 60 * 1000);
  const eventCandidateEnd = new Date(at.getTime() + 36 * 60 * 60 * 1000);
  const eventRows = eventVisibility ? await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      type: calendarEvents.type,
      startsAt: scheduledOccurrences.startsAt,
      endsAt: scheduledOccurrences.endsAt,
      timezone: scheduledOccurrences.timezone,
      metadata: calendarEvents.metadata,
      siteId: scheduledOccurrences.siteId,
      sectionId: scheduledOccurrences.sectionId,
      sourceType: calendarEvents.sourceType,
    })
    .from(calendarEvents)
    .innerJoin(
      scheduledOccurrences,
      eq(calendarEvents.scheduledOccurrenceId, scheduledOccurrences.id),
    )
    .where(and(
      eventVisibility,
      ...(scope?[or(isNull(scheduledOccurrences.programId),inArray(scheduledOccurrences.programId,scope.programIds))]:[]),
      gte(scheduledOccurrences.startsAt, eventCandidateStart),
      lt(scheduledOccurrences.startsAt, eventCandidateEnd),
    ))
    .orderBy(asc(scheduledOccurrences.startsAt)) : [];
  const events = eventRows.filter(event =>
    dateKeyInTimezone(at.toISOString(), event.timezone) ===
    dateKeyInTimezone(event.startsAt.toISOString(), event.timezone),
  ).map(event => ({
    id: event.id,
    title: event.title,
    description: event.description,
    type: event.type,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    siteId: event.siteId,
    sectionId: event.sectionId,
    sourceType: event.sourceType,
    cancelled: event.metadata.cancelled === true,
  }));

  const coursework = sectionIds.length ? await db
    .select({
      submissionId: submissions.id,
      assessmentId: assessments.id,
      assessmentTitle: assessments.title,
      instructions: assessments.instructions,
      dueAt: assessments.dueAt,
      status: submissions.status,
      timeliness: submissions.timeliness,
      score: submissions.score,
      pointsPossible: assessments.pointsPossible,
      feedback: submissions.feedback,
      response: submissions.response,
      sectionId: assessments.sectionId,
      submittedAt: submissions.submittedAt,
    })
    .from(submissions)
    .innerJoin(assessments, eq(submissions.assessmentId, assessments.id))
    .where(and(
      eq(submissions.studentProfileId, studentProfileId),
      inArray(assessments.sectionId, sectionIds),
      eq(assessments.status, "published"),
      or(
        eq(submissions.timeliness, "missing"),
        ...[...dayRanges.values()].map(range => and(
          inArray(assessments.sectionId, range.sectionIds),
          or(
            gte(assessments.dueAt, range.start),
            gte(submissions.gradedAt, range.start),
          ),
        )),
      ),
    ))
    .orderBy(asc(assessments.dueAt)) : [];

  const openActions = await db
    .select({
      id: actions.id,
      title: actions.title,
      description: actions.description,
      dueAt: actions.dueAt,
      priority: actions.priority,
      subjectType: actions.subjectType,
      subjectId: actions.subjectId,
    })
    .from(actions)
    .where(and(
      eq(actions.ownerPersonId, student.personId),
      eq(actions.status, "open"),
      ...(scope?[or(isNull(actions.siteId),inArray(actions.siteId,scope.siteIds)),
        or(isNull(actions.programId),inArray(actions.programId,scope.programIds))]:[]),
    ))
    .orderBy(asc(actions.dueAt));

  return {
    student,
    generatedAt: at,
    dayStartUtc: startOfDay,
    dayEndUtc: endOfDay,
    sections: activeSections,
    events,
    coursework,
    openActions,
    recoveryCandidates: coursework.filter(row =>
      row.timeliness === "missing" ||
      (row.score !== null && row.pointsPossible !== null &&
       Number(row.pointsPossible) > 0 &&
       Number(row.score) / Number(row.pointsPossible) < 0.8),
    ),
  };
}
