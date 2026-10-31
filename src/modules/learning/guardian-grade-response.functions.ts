import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, actions, assessments, enrollments, guardianRelationships,
  people, programs, sectionTeachers, sections, studentProfiles, submissions, terms,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import {
  gradeResponseActionType, gradeResponseRequestedMessage, isGuardianGradeResponseAction,
} from "@/domain/grade-response-policy";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { requireTeachingEligibility } from "@/modules/staffing/teaching-eligibility.server";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";

const submissionInput = z.object({ submissionId: z.string().uuid() }).strict();
const requestInput = submissionInput.extend({
  message: z.string().trim().min(10).max(1000),
}).strict();

async function guardianActor() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "guardian" || !actor.actorPersonId)
    throw new AuthorizationError("authorized guardian");
  assertCapability(actor, "student:related-read");
  return actor;
}

async function visibleGradedSubmission(actor: Awaited<ReturnType<typeof guardianActor>>,
  submissionId: string, executor: Pick<typeof db, "select"> = db) {
  const activeProgramMembership=alias(enrollments,"guardian_grade_response_program_membership");
  const [row] = await executor.select({
    submissionId: submissions.id, studentProfileId: studentProfiles.id,
    studentPersonId: studentProfiles.personId,
    sectionId: sections.id, siteId: sections.siteId,
    programId: sections.programId, organizationId: programs.organizationId,
    title: assessments.title,
  }).from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(sections, eq(sections.id, assessments.sectionId))
    .innerJoin(terms,eq(terms.id,sections.termId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
    .innerJoin(guardianRelationships, guardianRelationshipPredicate({
      guardianPersonId: actor.actorPersonId!,
      studentPersonId: studentProfiles.personId,
      access: "academic",
    }))
    .innerJoin(enrollments, and(
      eq(enrollments.studentProfileId, studentProfiles.id),
      eq(enrollments.sectionId, sections.id),
      eq(enrollments.programId,sections.programId),
      eq(enrollments.schoolYearId,terms.schoolYearId),
      eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
    ))
    .innerJoin(activeProgramMembership,and(
      eq(activeProgramMembership.studentProfileId,studentProfiles.id),
      eq(activeProgramMembership.programId,sections.programId),
      eq(activeProgramMembership.schoolYearId,terms.schoolYearId),
      eq(activeProgramMembership.kind,"program"),
      eq(activeProgramMembership.status,"active"),
    ))
    .where(and(
      eq(submissions.id, submissionId),
      inArray(submissions.status, ["graded", "returned"]),
      eq(sections.active,true),
      inArray(sections.siteId, actor.scope.siteIds ?? []),
      inArray(sections.programId, actor.scope.programIds ?? []),
      inArray(programs.organizationId, actor.scope.organizationIds ?? []),
    )).limit(1);
  if (!row || !row.siteId) throw new AuthorizationError("related graded assignment in an active class");
  return { ...row, siteId: row.siteId };
}

async function relatedResponse(actor: Awaited<ReturnType<typeof guardianActor>>,
  submissionId: string) {
  const record = await visibleGradedSubmission(actor, submissionId);
  const matches = await db.select({
    id: actions.id, type: actions.type, status: actions.status,
    subjectType: actions.subjectType, metadata: actions.metadata,
    resolutionNote: actions.resolutionNote, updatedAt: actions.updatedAt,
  }).from(actions).where(and(
    eq(actions.type, gradeResponseActionType),
    eq(actions.subjectType, "student_profile"),
    eq(actions.subjectId, record.studentProfileId),
    eq(actions.sectionId, record.sectionId),
    sql`${actions.metadata} @> ${JSON.stringify({
      submissionId, requestedByGuardianPersonId: actor.actorPersonId,
    })}::jsonb`,
  )).orderBy(desc(actions.createdAt)).limit(1);
  const found = matches[0];
  if (!found || !isGuardianGradeResponseAction(found, actor.actorPersonId!, submissionId))
    return null;
  return {
    id: found.id, status: found.status, resolutionNote: found.resolutionNote,
    requestMessage: typeof found.metadata.requestMessage === "string" ? found.metadata.requestMessage : "",
    updatedAt: found.updatedAt.toISOString(),
  };
}

/**
 * Household school-question history over the same canonical Actions as the
 * teacher queue. This is not a second inbox or status model.
 * Only this guardian's own requests and current live academic relationships
 * are selected by the database, including for older released attempts.
 */
export const listGuardianGradeFollowUps = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await guardianActor();
  setResponseHeader("Cache-Control", "private, no-store");
  const activeProgram = alias(enrollments, "guardian_grade_followup_active_program");
  const rows = await db.select({
    id: actions.id, status: actions.status, resolutionNote: actions.resolutionNote,
    updatedAt: actions.updatedAt, metadata: actions.metadata,
    studentPersonId: studentProfiles.personId,
    studentName: sql<string>`concat(${people.legalFirstName}, ' ', ${people.legalLastName})`,
    assessmentId: assessments.id, assessmentTitle: assessments.title,
    sectionId: sections.id, submissionId: submissions.id,
  }).from(actions)
    .innerJoin(submissions, eq(sql<string>`${submissions.id}::text`, sql<string>`${actions.metadata}->>'submissionId'`))
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(sections, eq(sections.id, assessments.sectionId))
    .innerJoin(terms, eq(terms.id, sections.termId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
    .innerJoin(people, eq(people.id, studentProfiles.personId))
    .innerJoin(guardianRelationships, guardianRelationshipPredicate({
      guardianPersonId: actor.actorPersonId!,
      studentPersonId: studentProfiles.personId,
      access: "academic",
    }))
    .innerJoin(enrollments, and(
      eq(enrollments.studentProfileId, studentProfiles.id),
      eq(enrollments.sectionId, sections.id),
      eq(enrollments.programId, sections.programId),
      eq(enrollments.schoolYearId, terms.schoolYearId),
      eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
    ))
    .innerJoin(activeProgram, and(
      eq(activeProgram.studentProfileId, studentProfiles.id),
      eq(activeProgram.programId, sections.programId),
      eq(activeProgram.schoolYearId, terms.schoolYearId),
      eq(activeProgram.kind, "program"), eq(activeProgram.status, "active"),
    ))
    .where(and(
      eq(actions.type, gradeResponseActionType),
      eq(actions.subjectType, "student_profile"),
      eq(actions.subjectId, studentProfiles.id),
      eq(actions.sectionId, sections.id),
      sql`${actions.metadata} @> ${JSON.stringify({requestedByGuardianPersonId: actor.actorPersonId})}::jsonb`,
      inArray(submissions.status, ["graded", "returned"]),
      eq(sections.active, true),
      inArray(sections.siteId, actor.scope.siteIds ?? []),
      inArray(sections.programId, actor.scope.programIds ?? []),
      inArray(programs.organizationId, actor.scope.organizationIds ?? []),
      or(inArray(actions.status, ["open", "in_progress", "waiting"]),
        and(eq(actions.status, "resolved"),
          gte(actions.resolvedAt, new Date(Date.now() - 30 * 86400000)))),
    ))
    .orderBy(sql`case when ${actions.status} = 'resolved' then 1 else 0 end`, desc(actions.updatedAt))
    .limit(31);
  return {
    items: rows.slice(0, 30).map(row => ({
      id: row.id, status: row.status, studentName: row.studentName,
      studentPersonId: row.studentPersonId, assessmentId: row.assessmentId,
      assessmentTitle: row.assessmentTitle, sectionId: row.sectionId,
      submissionId: row.submissionId,
      question: typeof row.metadata.requestMessage === "string" ? row.metadata.requestMessage : "",
      resolutionNote: row.resolutionNote, updatedAt: row.updatedAt.toISOString(),
    })),
    truncated: rows.length > 30,
  };
});

/** Never return responses submitted by a different guardian, even for the same child. */
export const getGuardianGradeResponse = createServerFn({ method: "GET" })
  .validator((value: unknown) => submissionInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await guardianActor();
    setResponseHeader("Cache-Control", "private, no-store");
    return { response: await relatedResponse(actor, data.submissionId) };
  });

/**
 * Guardian asks the local school to review already released feedback.
 * The school receives a normal operations Action. Grade content stays in
 * the original submission; creating this Action cannot change any score.
 */
export const requestGuardianGradeResponse = createServerFn({ method: "POST" })
  .validator((value: unknown) => requestInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await guardianActor();
    const message = gradeResponseRequestedMessage(data.message);
    return db.transaction(async tx => {
      const record = await visibleGradedSubmission(actor, data.submissionId, tx);
      // Serialize parallel retries for the same caller/submission even before
      // the Action exists. No DDL or global idempotency key is necessary.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${actor.actorPersonId!}), hashtext(${data.submissionId}))`);
      const matching = await tx.select({
        id: actions.id, metadata: actions.metadata, status: actions.status,
        subjectType: actions.subjectType, type: actions.type,
      }).from(actions).where(and(
        eq(actions.type, gradeResponseActionType),
        eq(actions.subjectType, "student_profile"),
        eq(actions.subjectId, record.studentProfileId),
        eq(actions.sectionId, record.sectionId),
        sql`${actions.metadata} @> ${JSON.stringify({
          submissionId: data.submissionId, requestedByGuardianPersonId: actor.actorPersonId,
        })}::jsonb`,
      )).limit(1);
      const previous = matching[0];
      if (previous) {
        if (!isGuardianGradeResponseAction(previous, actor.actorPersonId!, data.submissionId))
          throw new AuthorizationError("guardian response ownership");
        if (previous.metadata.requestMessage !== message)
          throw new Error("A follow-up already exists; review its status before submitting again");
        return { actionId: previous.id, status: previous.status, created: false as const };
      }

      const [created] = await tx.insert(actions).values({
        type: gradeResponseActionType,
        title: "Guardian requests grade follow-up: " + record.title,
        description: message, status: "open", priority: "normal",
        organizationId: record.organizationId, siteId: record.siteId,
        programId: record.programId, sectionId: record.sectionId,
        subjectType: "student_profile", subjectId: record.studentProfileId,
        metadata: {
          requestedByGuardianPersonId: actor.actorPersonId,
          submissionId: data.submissionId, requestMessage: message,
        },
      }).returning({ id: actions.id });
      if (!created) throw new Error("Unable to create school follow-up");

      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated, aggregateType: "action",
        aggregateId: created.id, actorPersonId: actor.actorPersonId,
        organizationId: record.organizationId, siteId: record.siteId,
        programId: record.programId, sectionId: record.sectionId,
        payload: { source: gradeResponseActionType, submissionId: data.submissionId },
      });
      await writeAudit(tx, actor, {
        action: "guardian.grade_response.request", entityType: "action",
        entityId: created.id,
        scope: { organizationId: record.organizationId, siteId: record.siteId,
          programId: record.programId, sectionId: record.sectionId },
        after: { status: "open", submissionId: data.submissionId },
      });

      const [teachers, registrars] = await Promise.all([
        tx.select({ personId: sectionTeachers.personId }).from(sectionTeachers)
          .where(and(eq(sectionTeachers.sectionId, record.sectionId), eq(sectionTeachers.role, "teacher"))),
        tx.select({ personId: accountPersonGrants.personId })
          .from(accountPersonGrants)
          .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
          .where(and(
            eq(accountPersonGrants.role, "registrar"),
            eq(accountPersonGrants.organizationId, record.organizationId),
            eq(accountPersonGrants.active, true),
            eq(accessAccounts.disabled, false),
            or(eq(accountPersonGrants.siteId, record.siteId),
              isNull(accountPersonGrants.siteId)),
          )),
      ]);
      // Only notify teachers who can currently teach this exact Section.
      // Historic/assistant assignments or revoked qualifications must not
      // receive a new guardian academic notification.
      const eligibleTeacherIds: string[] = [];
      for (const teacher of teachers) {
        try {
          await requireTeachingEligibility(record.sectionId, teacher.personId, tx, {
            horizon: "current", requireAssignment: true,
          });
          eligibleTeacherIds.push(teacher.personId);
        } catch (error) {
          if (!(error instanceof AuthorizationError)) throw error;
        }
      }
      const recipients = [...new Set([...eligibleTeacherIds,
        ...registrars.map(r => r.personId)])];
      await notifyMany(tx, recipients.map(recipientPersonId => ({
        recipientPersonId, type: "guardian_grade_follow_up_requested",
        title: "Guardian requested an academic follow-up",
        body: "Review the guardian's question in the authorized school operations queue.",
        resourceType: "action", resourceId: created.id,
      })));
      return { actionId: created.id, status: "open" as const, created: true as const };
    });
  });
