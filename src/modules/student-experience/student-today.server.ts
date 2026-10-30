/**
 * Database-backed Student Today read model.
 * Server-side composition only; not exported through a public route or called
 * from the demo UI until a real student session exists.
 */
import { and, asc, eq, gte, inArray, isNull, lt, ne, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { isCurrentCoursework } from "@/domain/student-today-coursework";
import {
  actions, assessments, calendarEvents, enrollments, people, sections,
  scheduledOccurrences, studentProfiles, submissions, terms,
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

  const activeProgramMembership=alias(enrollments,"student_today_active_program");
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
    .innerJoin(terms,eq(terms.id,sections.termId))
    .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,enrollments.studentProfileId),
      eq(activeProgramMembership.programId,sections.programId),
      eq(activeProgramMembership.schoolYearId,terms.schoolYearId),
      eq(activeProgramMembership.kind,"program"),
      eq(activeProgramMembership.status,"active"),
    ))
    .where(and(
      eq(enrollments.studentProfileId, studentProfileId),
      eq(enrollments.kind, "section"),
      eq(enrollments.status, "active"),
      eq(enrollments.programId,sections.programId),
      eq(enrollments.schoolYearId,terms.schoolYearId),
      eq(sections.active, true),
      ...(scope?[inArray(sections.siteId,scope.siteIds),inArray(sections.programId,scope.programIds)]:[]),
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
      ...(scope?[or(isNull(scheduledOccurrences.programId),inArray(scheduledOccurrences.programId,scope.programIds))]:[]),
      ne(calendarEvents.type, "extended_learning_session"), // keep draft camp plans out of Student Today
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
      attemptNumber: submissions.attemptNumber,
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
    .from(assessments)
    .leftJoin(submissions, and(
      eq(submissions.assessmentId, assessments.id),
      eq(submissions.studentProfileId, studentProfileId),
    ))
    .where(and(
      inArray(assessments.sectionId, sectionIds),
      eq(assessments.status, "published"),
      // Apply recency after selecting the latest attempt. Filtering attempts
      // here could resurrect an older missing/graded attempt when a newer
      // revision has already been submitted.

    ))
    .orderBy(asc(assessments.dueAt)) : [];

  // A returned assessment may have several attempts. Student Today shows only
  // the latest attempt; older feedback remains available in assignment history.
  const latestCoursework = new Map<string, (typeof coursework)[number]>();
  for (const row of coursework) {
    const previous = latestCoursework.get(row.assessmentId);
    if (!previous || (row.attemptNumber ?? 0) > (previous.attemptNumber ?? 0)) {
      latestCoursework.set(row.assessmentId, row);
    }
  }
  const currentCoursework = [...latestCoursework.values()].filter(row => isCurrentCoursework(row, startOfDay));

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
    coursework: currentCoursework,
    openActions,
    recoveryCandidates: currentCoursework.filter(row =>
      row.timeliness === "missing" ||
      (row.score !== null && row.pointsPossible !== null &&
       Number(row.pointsPossible) > 0 &&
       Number(row.score) / Number(row.pointsPossible) < 0.8),
    ),
  };
}
