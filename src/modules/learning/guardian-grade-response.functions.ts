import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  accessAccounts, accountPersonGrants, actions, assessments, enrollments, guardianRelationships,
  programs, sectionTeachers, sections, studentProfiles, submissions,
} from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import {
  gradeResponseActionType, gradeResponseRequestedMessage, isGuardianGradeResponseAction,
} from "@/domain/grade-response-policy";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
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
  const [row] = await executor.select({
    submissionId: submissions.id, studentProfileId: studentProfiles.id,
    studentPersonId: studentProfiles.personId,
    sectionId: sections.id, siteId: sections.siteId,
    programId: sections.programId, organizationId: programs.organizationId,
    title: assessments.title,
  }).from(submissions)
    .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
    .innerJoin(sections, eq(sections.id, assessments.sectionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
    .innerJoin(guardianRelationships, guardianRelationshipPredicate({
      guardianPersonId: actor.actorPersonId,
      studentPersonId: studentProfiles.personId,
      access: "academic",
    }))
    .innerJoin(enrollments, and(
      eq(enrollments.studentProfileId, studentProfiles.id),
      eq(enrollments.sectionId, sections.id),
      eq(enrollments.kind, "section"), eq(enrollments.status, "active"),
    ))
    .where(and(
      eq(submissions.id, submissionId),
      eq(submissions.status, "graded"),
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
    updatedAt: found.updatedAt.toISOString(),
  };
}

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
          .where(eq(sectionTeachers.sectionId, record.sectionId)),
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
      const recipients = [...new Set([...teachers.map(t => t.personId),
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
