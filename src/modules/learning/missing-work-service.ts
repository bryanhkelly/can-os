import { db } from "@/db/client";
import {
assessments,
enrollments,
studentProfiles,
submissions
} from "@/db/schema";
import {
assertCapability,
assertSectionScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { and,eq,lt } from "drizzle-orm";

export async function publishAssessment(
  context: CommandContext,
  assessmentId: string,
): Promise<void> {
  assertCapability(context, "assessment.publish");

  await db.transaction(async (tx) => {
    const [assessment] = await tx
      .select({
        id: assessments.id,
        sectionId: assessments.sectionId,
        status: assessments.status,
        dueAt: assessments.dueAt,
      })
      .from(assessments)
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) throw new Error("Assessment not found");

    assertSectionScope(context, assessment.sectionId);

    if (assessment.status === "published") return;

    const activeEnrollments = await tx
      .select({ studentProfileId: enrollments.studentProfileId })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.kind, "section"),
          eq(enrollments.sectionId, assessment.sectionId),
          eq(enrollments.status, "active"),
        ),
      );

    await tx
      .update(assessments)
      .set({ status: "published", updatedAt: new Date() })
      .where(eq(assessments.id, assessmentId));

    if (activeEnrollments.length > 0) {
      await tx
        .insert(submissions)
        .values(
          activeEnrollments.map(({ studentProfileId }) => ({
            assessmentId,
            studentProfileId,
            status: "assigned" as const,
            timeliness: "on_time" as const,
          })),
        )
        .onConflictDoNothing();
    }

    await emitEvent(tx, {
      eventType: EventTypes.AssessmentPublished,
      aggregateType: "assessment",
      aggregateId: assessmentId,
      actorPersonId: context.actorPersonId,
      payload: {
        sectionId: assessment.sectionId,
        dueAt: assessment.dueAt?.toISOString() ?? null,
        assignedCount: activeEnrollments.length,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "assessment.publish",
      resourceType: "assessment",
      resourceId: assessmentId,
      scope: { sectionId: assessment.sectionId },
      before: { status: assessment.status },
      after: { status: "published" },
      context: { requestId: context.requestId ?? null },
    });
  });
}

export async function markOverdueSubmissionsMissing(
  now = new Date(),
): Promise<number> {
  return db.transaction(async (tx) => {
    const overdue = await tx
      .select({
        submissionId: submissions.id,
        assessmentId: assessments.id,
        studentProfileId: submissions.studentProfileId,
        sectionId: assessments.sectionId,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .where(
        and(
          eq(assessments.status, "published"),
          lt(assessments.dueAt, now),
          eq(submissions.status, "assigned"),
          eq(submissions.timeliness, "on_time"),
        ),
      );

    let changed = 0;

    for (const row of overdue) {
      const [updated] = await tx
        .update(submissions)
        .set({ timeliness: "missing", updatedAt: now })
        .where(
          and(
            eq(submissions.id, row.submissionId),
            eq(submissions.status, "assigned"),
            eq(submissions.timeliness, "on_time"),
          ),
        )
        .returning({ id: submissions.id });

      if (!updated) continue;
      changed += 1;

      await emitEvent(tx, {
        eventType: EventTypes.AssignmentBecameMissing,
        aggregateType: "submission",
        aggregateId: row.submissionId,
        actorPersonId: null,
        payload: {
          assessmentId: row.assessmentId,
          studentProfileId: row.studentProfileId,
          sectionId: row.sectionId,
        },
      });

      await writeAudit(tx, {
        actorPersonId: null,
        action: "submission.mark_missing",
        resourceType: "submission",
        resourceId: row.submissionId,
        scope: { sectionId: row.sectionId },
        before: { status: "assigned", timeliness: "on_time" },
        after: { status: "assigned", timeliness: "missing" },
        context: { source: "deadline-worker" },
      });
    }

    return changed;
  });
}

export async function submitAssessment(
  context: CommandContext,
  submissionId: string,
  response: Record<string, unknown>,
  submittedAt = new Date(),
): Promise<void> {
  assertCapability(context, "submission.submit");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: submissions.id,
        status: submissions.status,
        timeliness: submissions.timeliness,
        assessmentId: submissions.assessmentId,
        studentProfileId: submissions.studentProfileId,
        sectionId: assessments.sectionId,
        dueAt: assessments.dueAt,
        studentPersonId: studentProfiles.personId,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!current) throw new Error("Submission not found");

    assertSectionScope(context, current.sectionId);
    if (!context.actorPersonId || current.studentPersonId !== context.actorPersonId) {
      throw new Error("Submission actor must be the enrolled student");
    }

    if (current.status !== "assigned") {
      throw new Error("Submission has already been submitted or graded");
    }

    const timeliness =
      current.dueAt && submittedAt > current.dueAt ? "late" : "on_time";

    const submitted = await tx
      .update(submissions)
      .set({
        status: "submitted",
        timeliness,
        submittedAt,
        response,
        updatedAt: submittedAt,
      })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, "assigned")))
      .returning({ id: submissions.id });

    if (!submitted.length) throw new Error("Submission was already processed");

    await emitEvent(tx, {
      eventType: EventTypes.SubmissionReceived,
      aggregateType: "submission",
      aggregateId: submissionId,
      actorPersonId: context.actorPersonId,
      payload: {
        assessmentId: current.assessmentId,
        studentProfileId: current.studentProfileId,
        sectionId: current.sectionId,
        timeliness,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "submission.submit",
      resourceType: "submission",
      resourceId: submissionId,
      scope: { sectionId: current.sectionId },
      before: {
        status: current.status,
        timeliness: current.timeliness,
      },
      after: { status: "submitted", timeliness },
      context: { requestId: context.requestId ?? null },
    });
  });
}

export async function gradeSubmission(
  context: CommandContext,
  submissionId: string,
  input: {
    score: string;
    feedback?: Record<string, unknown>;
  },
): Promise<void> {
  assertCapability(context, "submission.grade");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: submissions.id,
        status: submissions.status,
        timeliness: submissions.timeliness,
        assessmentId: submissions.assessmentId,
        studentProfileId: submissions.studentProfileId,
        sectionId: assessments.sectionId,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!current) throw new Error("Submission not found");
    assertSectionScope(context, current.sectionId);
    // The gradebook can issue a command from an institution-owned CAN teacher
    // without a church Site grant. Recheck exact class assignment and current
    // institutional academic authority IN this write transaction; otherwise
    // revoking the CAN/church agreement between page load and grading could
    // still commit a GradePosted event.
    if ("role" in context && context.role === "teacher") {
      const { authorizeClass } = await import("./class-access.server");
      const actor = context as import("@/modules/identity/actors.server").Actor;
      await authorizeClass(actor, current.sectionId, undefined, tx);
    }
    if (current.status !== "submitted") {
      throw new Error("Only submitted work can be graded");
    }

    const gradedAt = new Date();

    const graded = await tx
      .update(submissions)
      .set({
        status: "graded",
        score: input.score,
        feedback: input.feedback ?? {},
        graderPersonId: context.actorPersonId,
        gradedAt,
        updatedAt: gradedAt,
      })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, "submitted")))
      .returning({ id: submissions.id });

    if (!graded.length) throw new Error("Submission grading was already processed");

    await emitEvent(tx, {
      eventType: EventTypes.GradePosted,
      aggregateType: "submission",
      aggregateId: submissionId,
      actorPersonId: context.actorPersonId,
      payload: {
        assessmentId: current.assessmentId,
        studentProfileId: current.studentProfileId,
        sectionId: current.sectionId,
        score: input.score,
        timeliness: current.timeliness,
      },
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "submission.grade",
      resourceType: "submission",
      resourceId: submissionId,
      scope: { sectionId: current.sectionId },
      before: { status: current.status },
      after: { status: "graded", score: input.score },
      context: { requestId: context.requestId ?? null },
    });
  });
}
