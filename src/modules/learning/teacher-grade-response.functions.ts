import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { accessibleClasses } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { assertAcademicActionAuthority } from "@/modules/actions/academic-action-policy.server";
import { resolveActionInTransaction } from "@/modules/actions/resolve-action";

async function teacher() {
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "teacher" || !actor.actorPersonId)
    throw new AuthorizationError("verified academic teacher");
  assertCapability(actor, "teacher:read");
  return actor;
}

/** The existing guardian Actions, limited by live academic Section authority. */
export const getTeacherGradeResponses = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await teacher();
  setResponseHeader("Cache-Control", "private, no-store");
  const sectionIds = (await accessibleClasses(actor as Actor)).map(row => row.id);
  if (!sectionIds.length) return { items: [], truncated: false };
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  return db.transaction(async tx => {
    const programEnrollment = alias(s.enrollments, "teacher_grade_response_program_enrollment");
    const rows = await tx.select({
      action: s.actions, studentName: sql<string>`concat(${s.people.legalFirstName}, ' ', ${s.people.legalLastName})`,
      assessmentId: s.assessments.id, assessmentTitle: s.assessments.title,
      submissionId: s.submissions.id, attemptNumber: s.submissions.attemptNumber,
      score: s.submissions.score, feedback: s.submissions.feedback,
      pointsPossible: s.assessments.pointsPossible,
    }).from(s.actions)
      .innerJoin(s.submissions, eq(sql<string>`${s.submissions.id}::text`, sql<string>`${s.actions.metadata}->>'submissionId'`))
      .innerJoin(s.assessments, eq(s.assessments.id, s.submissions.assessmentId))
      .innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
      .innerJoin(s.terms, eq(s.terms.id, s.sections.termId))
      // Do not let withdrawn students' old Actions crowd out current questions.
      // Both a live Section seat and its same-year Program seat are required.
      .innerJoin(s.enrollments, and(
        eq(s.enrollments.studentProfileId, s.submissions.studentProfileId),
        eq(s.enrollments.sectionId, s.sections.id),
        eq(s.enrollments.programId, s.sections.programId),
        eq(s.enrollments.schoolYearId, s.terms.schoolYearId),
        eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
      ))
      .innerJoin(programEnrollment, and(
        eq(programEnrollment.studentProfileId, s.submissions.studentProfileId),
        eq(programEnrollment.programId, s.sections.programId),
        eq(programEnrollment.schoolYearId, s.terms.schoolYearId),
        eq(programEnrollment.kind, "program"), eq(programEnrollment.status, "active"),
      ))
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.submissions.studentProfileId))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .where(and(
        eq(s.actions.type, gradeResponseActionType),
        eq(s.actions.subjectType, "student_profile"),
        eq(s.actions.subjectId, s.submissions.studentProfileId),
        eq(s.actions.sectionId, s.assessments.sectionId),
        inArray(s.actions.sectionId, sectionIds),
        inArray(s.submissions.status, ["graded", "returned"]),
        or(inArray(s.actions.status, ["open", "in_progress", "waiting"]),
          and(eq(s.actions.status, "resolved"), gte(s.actions.resolvedAt, new Date(Date.now() - 30 * 86400000)))),
      ))
      .orderBy(sql`case when ${s.actions.status} = 'resolved' then 1 else 0 end`, asc(s.actions.createdAt))
      .limit(51);
    const items = [];
    for (const row of rows.slice(0, 50)) {
      try {
        await assertAcademicActionAuthority(tx, actor, row.action);
      } catch (error) {
        if (error instanceof AuthorizationError) continue;
        throw error;
      }
      items.push({
        id: row.action.id, sectionId: row.action.sectionId!,
        studentProfileId: row.action.subjectId, studentName: row.studentName,
        assessmentId: row.assessmentId, assessmentTitle: row.assessmentTitle,
        submissionId: row.submissionId, attemptNumber: row.attemptNumber,
        // This is the exact already-released attempt named by the guardian's
        // Action, not a newer draft or revision from the live gradebook.
        score: row.score, pointsPossible: row.pointsPossible,
        teacherFeedback: typeof row.feedback?.comment === "string" ? row.feedback.comment : "",
        message: typeof row.action.metadata.requestMessage === "string" ? row.action.metadata.requestMessage : "",
        status: row.action.status, resolutionNote: row.action.resolutionNote,
      });
    }
    return { items, truncated: rows.length > 50 };
  });
});

export const resolveTeacherGradeResponse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    actionId: z.string().uuid(), response: z.string().trim().min(10).max(2000),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await teacher();
    assertCapability(actor, "action.resolve");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [action] = await tx.select({ id: s.actions.id, type: s.actions.type })
        .from(s.actions).where(eq(s.actions.id, data.actionId)).for("update").limit(1);
      if (!action || action.type !== gradeResponseActionType)
        throw new AuthorizationError("guardian grade follow-up Action");
      await resolveActionInTransaction(tx, actor, { actionId: action.id, resolutionNote: data.response });
      return { saved: true };
    });
  });
