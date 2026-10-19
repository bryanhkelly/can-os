/**
 * Database-backed Student Today read model.
 * Server-side composition only; not exported through a public route or called
 * from the demo UI until a real student session exists.
 */
import { and, asc, eq, gte, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db/client";
import {
  actions, assessments, calendarEvents, enrollments, people, sections,
  scheduledOccurrences, studentProfiles, submissions,
} from "@/db/schema";

export type StudentTodayData = Awaited<ReturnType<typeof getStudentToday>>;

export async function getStudentToday(studentProfileId: string, at = new Date()) {
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
      programId: sections.programId,
      schoolYearId: enrollments.schoolYearId,
    })
    .from(enrollments)
    .innerJoin(sections, eq(enrollments.sectionId, sections.id))
    .where(and(
      eq(enrollments.studentProfileId, studentProfileId),
      eq(enrollments.kind, "section"),
      eq(enrollments.status, "active"),
      eq(sections.active, true),
    ));

  const sectionIds = activeSections.map((row) => row.sectionId);
  const siteIds = [...new Set(activeSections.map((row) => row.siteId).filter((id): id is string => Boolean(id)))];

  const startOfDay = new Date(at);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

  // Site calendar is the source of truth for operations/formation;
  // a separate timezone-aware day boundary resolver will be required for
  // local-day fidelity before live release.
  const events = siteIds.length ? await db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      description: calendarEvents.description,
      type: calendarEvents.type,
      startsAt: scheduledOccurrences.startsAt,
      endsAt: scheduledOccurrences.endsAt,
      timezone: scheduledOccurrences.timezone,
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
      inArray(scheduledOccurrences.siteId, siteIds),
      gte(scheduledOccurrences.startsAt, startOfDay),
      lt(scheduledOccurrences.startsAt, endOfDay),
      or(
        ...[
          ...sectionIds.map(id => eq(scheduledOccurrences.sectionId, id)),
          isNull(scheduledOccurrences.sectionId),
        ],
      ),
    ))
    .orderBy(asc(scheduledOccurrences.startsAt)) : [];

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
        gte(assessments.dueAt, startOfDay),
        gte(submissions.gradedAt, startOfDay),
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
