import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  auditEvents,
  domainEvents,
  enrollments,
  submissions,
  studentProfiles,
} from "@/db/schema";
import {
  assertCapability,
  assertSectionScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

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
        studentPersonId: studentProfiles.personId,
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

    await tx.insert(domainEvents).values({
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

    await tx.insert(auditEvents).values({
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
          ),
        )
        .returning({ id: submissions.id });

      if (!updated) continue;
      changed += 1;

      await tx.insert(domainEvents).values({
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

      await tx.insert(auditEvents).values({
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

    const timeliness =
      current.dueAt && submittedAt > current.dueAt ? "late" : "on_time";

    await tx
      .update(submissions)
      .set({
        status: "submitted",
        timeliness,
        submittedAt,
        response,
        updatedAt: submittedAt,
      })
      .where(eq(submissions.id, submissionId));

    await tx.insert(domainEvents).values({
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

    await tx.insert(auditEvents).values({
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

    const gradedAt = new Date();

    await tx
      .update(submissions)
      .set({
        status: "graded",
        score: input.score,
        feedback: input.feedback ?? {},
        graderPersonId: context.actorPersonId,
        gradedAt,
        updatedAt: gradedAt,
      })
      .where(eq(submissions.id, submissionId));

    await tx.insert(domainEvents).values({
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

    await tx.insert(auditEvents).values({
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
