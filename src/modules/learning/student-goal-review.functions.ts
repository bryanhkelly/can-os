import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import {
  isStudentGoalPublicReview, studentGoalReviewInput,
  statusFromTeacherGoalReview, STUDENT_LEARNING_GOAL_TYPE,
} from "@/domain/teacher-student-goal";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { z } from "zod";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
const selectedGoalInput = z.object({ goalActionId: z.string().uuid() }).strict();

async function verifiedTeacher(): Promise<AccessContext & { actorPersonId: string }> {
  const { getCommandContext } = await import("@/modules/identity/command-context.server");
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "teacher" || !actor.actorPersonId)
    throw new AuthorizationError("assigned teacher required for goal review");
  assertCapability(actor, "teacher:read");
  assertCapability(actor, "action.resolve");
  return { ...actor, actorPersonId: actor.actorPersonId };
}

/** Called only after loading a goal row. Revalidate teacher, class, student,
 * institution and original PRIVATE teacher Action on every read and write. */
async function authorizeGoal(tx: Tx, actor: AccessContext & { actorPersonId: string },
  goal: typeof import("@/db/schema").actions.$inferSelect) {
  const s = await import("@/db/schema");
  if (goal.type !== STUDENT_LEARNING_GOAL_TYPE ||
      goal.metadata.source !== "teacher_shared_learning_goal" ||
      goal.subjectType !== "student_profile" || !goal.parentActionId ||
      !goal.sectionId || !goal.programId || !goal.organizationId || !goal.siteId) {
    throw new AuthorizationError("student goal with approved teacher origin");
  }
  const [parent] = await tx.select().from(s.actions)
    .where(eq(s.actions.id, goal.parentActionId)).limit(1);
  if (!parent || parent.type !== "academic_intervention" ||
      parent.metadata.source !== "teacher_learning_follow_up" ||
      parent.ownerPersonId !== actor.actorPersonId ||
      parent.subjectId !== goal.subjectId ||
      parent.sectionId !== goal.sectionId || parent.programId !== goal.programId ||
      parent.siteId !== goal.siteId || parent.organizationId !== goal.organizationId) {
    throw new AuthorizationError("current teacher-owned goal relationship");
  }
  const { assertAcademicActionAuthority } = await import(
    "@/modules/actions/academic-action-policy.server");
  await assertAcademicActionAuthority(tx, actor, parent);
  const [student] = await tx.select({ personId: s.studentProfiles.personId })
    .from(s.studentProfiles).where(eq(s.studentProfiles.id, goal.subjectId)).limit(1);
  if (!student || student.personId !== goal.ownerPersonId)
    throw new AuthorizationError("correct student goal ownership");
}

/** Show recent, actual graded classwork only for this teacher's student/goal. */
export const getStudentGoalGradedEvidence = createServerFn({ method: "GET" })
  .validator((value: unknown) => selectedGoalInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await verifiedTeacher();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [goal] = await tx.select().from(s.actions)
        .where(eq(s.actions.id, data.goalActionId)).limit(1);
      if (!goal) throw new AuthorizationError("accessible student learning goal");
      await authorizeGoal(tx, actor, goal);
      const rows = await tx.select({
        submissionId: s.submissions.id, assessmentId: s.assessments.id,
        assessmentTitle: s.assessments.title, gradedAt: s.submissions.gradedAt,
        score: s.submissions.score,
      }).from(s.submissions)
        .innerJoin(s.assessments, eq(s.submissions.assessmentId, s.assessments.id))
        .where(and(eq(s.submissions.studentProfileId, goal.subjectId),
          eq(s.assessments.sectionId, goal.sectionId!),
          eq(s.submissions.status, "graded"),
          isNotNull(s.submissions.gradedAt), isNotNull(s.submissions.score),
          gte(s.submissions.gradedAt, goal.createdAt),
          sql`NOT EXISTS (
            SELECT 1 FROM submissions AS newer
            WHERE newer.assessment_id = ${s.submissions.assessmentId}
              AND newer.student_profile_id = ${s.submissions.studentProfileId}
              AND newer.attempt_number > ${s.submissions.attemptNumber}
          )`))
        .orderBy(desc(s.submissions.gradedAt)).limit(30);
      return { goalActionId: goal.id, status: goal.status,
        availableEvidence: rows.map(row => ({
          submissionId: row.submissionId, assessmentTitle: row.assessmentTitle,
          gradedAt: row.gradedAt?.toISOString() ?? null,
          score: row.score,
        })),
        review: isStudentGoalPublicReview(goal.metadata.goalReview)
          ? goal.metadata.goalReview : null,
        note: "Select actual graded coursework. A teacher determines progress; score or learning clicks do not independently establish mastery.",
      };
    });
  });

/**
 * No student self-award, private notes, grade editing or automatic goal success.
 * A teacher must review a newly graded submission from this SAME student and
 * section and publish a separate student-safe feedback statement.
 */
export const reviewStudentLearningGoal = createServerFn({ method: "POST" })
  .validator((value: unknown) => studentGoalReviewInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await verifiedTeacher();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [goal] = await tx.select().from(s.actions)
        .where(eq(s.actions.id, data.goalActionId)).for("update").limit(1);
      if (!goal) throw new AuthorizationError("accessible student learning goal");
      await authorizeGoal(tx, actor, goal);
      const prior = goal.metadata.goalReview;
      // A repeated submission of the SAME teacher decision is idempotent.
      if (isStudentGoalPublicReview(prior) && typeof prior === "object" &&
          (prior as Record<string, unknown>).submissionId === data.gradedSubmissionId &&
          prior.outcome === data.outcome && prior.studentFeedback === data.studentFeedback) {
        return { goalActionId: goal.id, outcome: data.outcome, duplicate: true };
      }
      if (isStudentGoalPublicReview(prior) && typeof prior === "object" &&
          (prior as Record<string, unknown>).submissionId === data.gradedSubmissionId) {
        throw new AuthorizationError("same graded work already reviewed for goal");
      }
      if (goal.status === "resolved" || goal.status === "cancelled")
        throw new AuthorizationError("closed learning goal cannot be reviewed again");

      const [work] = await tx.select({
        id: s.submissions.id, assessmentId: s.submissions.assessmentId,
        attemptNumber: s.submissions.attemptNumber,
        gradedAt: s.submissions.gradedAt,
      }).from(s.submissions)
        .innerJoin(s.assessments, eq(s.assessments.id, s.submissions.assessmentId))
        .where(and(eq(s.submissions.id, data.gradedSubmissionId),
          eq(s.submissions.studentProfileId, goal.subjectId),
          eq(s.assessments.sectionId, goal.sectionId!),
          eq(s.submissions.status, "graded"), isNotNull(s.submissions.score),
          isNotNull(s.submissions.gradedAt),
          gte(s.submissions.gradedAt, goal.createdAt))).limit(1);
      if (!work || !work.gradedAt)
        throw new AuthorizationError("newly graded work for this student and class");

      const [latest] = await tx.select({
        id: s.submissions.id,
      }).from(s.submissions).where(and(
        eq(s.submissions.assessmentId, work.assessmentId),
        eq(s.submissions.studentProfileId, goal.subjectId),
      )).orderBy(desc(s.submissions.attemptNumber)).limit(1);
      if (latest?.id !== work.id)
        throw new AuthorizationError("most recent graded assessment attempt");

      const now = new Date();
      const nextStatus = statusFromTeacherGoalReview(data.outcome);
      const review = {
        outcome: data.outcome, studentFeedback: data.studentFeedback,
        reviewedAt: now.toISOString(), submissionId: work.id,
      };
      await tx.update(s.actions).set({
        status: nextStatus,
        resolvedAt: data.outcome === "met" ? now : null,
        resolutionNote: data.outcome === "met" ? data.studentFeedback : null,
        metadata: { ...goal.metadata, goalReview: review },
        updatedAt: now,
      }).where(eq(s.actions.id, goal.id));
      await emitEvent(tx, {
        eventType: data.outcome === "met" ? EventTypes.ActionResolved : EventTypes.StudentLearningGoalReviewed,
        aggregateType: "action", aggregateId: goal.id,
        actorPersonId: actor.actorPersonId,
        organizationId: goal.organizationId, siteId: goal.siteId,
        programId: goal.programId, sectionId: goal.sectionId,
        payload: { source: "teacher_reviewed_student_learning_goal",
          submissionId: work.id, outcome: data.outcome },
      });
      await writeAudit(tx, actor, {
        action: "student.learning_goal.reviewed",
        entityType: "action", entityId: goal.id,
        scope: { organizationId: goal.organizationId, siteId: goal.siteId,
          programId: goal.programId, sectionId: goal.sectionId },
        before: { status: goal.status },
        after: { status: nextStatus, outcome: data.outcome, submissionId: work.id,
          confirmedStudentSafe: data.confirmedStudentSafe },
      });
      return { goalActionId: goal.id, outcome: data.outcome, duplicate: false };
    });
  });
