import { latestSubmissionCondition } from "./latest-submission.server";
import { currentSectionStudentIds } from "./current-section-enrollment.server";
import { db } from "@/db/client";
import {
assessments,
enrollments,
sections,
terms,
studentProfiles,
submissions
} from "@/db/schema";
import {
assertCapability,
assertSectionScope,
type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { and,eq,lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

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
        programId:sections.programId,
        schoolYearId:terms.schoolYearId,
      })
      .from(assessments)
      .innerJoin(sections,eq(sections.id,assessments.sectionId))
      .innerJoin(terms,eq(terms.id,sections.termId))
      .where(eq(assessments.id, assessmentId))
      .limit(1);

    if (!assessment) throw new Error("Assessment not found");

    if ("role" in context && context.role === "teacher") {
      const { authorizeClass } = await import("./class-access.server");
      await authorizeClass(context as import("@/modules/identity/actors.server").Actor,
        assessment.sectionId,undefined,tx);
    } else {
      assertSectionScope(context, assessment.sectionId);
    }

    if (assessment.status === "published") return;

    const programMembership=alias(enrollments,"legacy_assessment_program_membership");
    const activeEnrollments=await tx.select({studentProfileId:enrollments.studentProfileId})
      .from(enrollments)
      .innerJoin(programMembership,and(
        eq(programMembership.studentProfileId,enrollments.studentProfileId),
        eq(programMembership.programId,assessment.programId),
        eq(programMembership.schoolYearId,assessment.schoolYearId),
        eq(programMembership.kind,"program"),
        eq(programMembership.status,"active"),
      ))
      .where(and(
        eq(enrollments.kind,"section"),eq(enrollments.status,"active"),
        eq(enrollments.sectionId,assessment.sectionId),
        eq(enrollments.programId,assessment.programId),
        eq(enrollments.schoolYearId,assessment.schoolYearId),
      ));

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
        studentPersonId: studentProfiles.personId,
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

    if ("role" in context && context.role === "student") {
      const { authorizeClass } = await import("./class-access.server");
      await authorizeClass(context as import("@/modules/identity/actors.server").Actor,
        current.sectionId,undefined,tx);
    } else {
      assertSectionScope(context,current.sectionId);
    }
    if (!context.actorPersonId || current.studentPersonId !== context.actorPersonId) {
      throw new Error("Submission actor must be the enrolled student");
    }
    const [section]=await tx.select({programId:sections.programId,
      schoolYearId:terms.schoolYearId})
      .from(sections).innerJoin(terms,eq(terms.id,sections.termId))
      .where(eq(sections.id,current.sectionId)).limit(1);
    if(!section)throw new Error("Active instructional Section not found");
    const programMembership=alias(enrollments,"legacy_submission_program_membership");
    const [authorized]=await tx.select({id:enrollments.id})
      .from(enrollments)
      .innerJoin(programMembership,and(
        eq(programMembership.studentProfileId,enrollments.studentProfileId),
        eq(programMembership.kind,"program"),eq(programMembership.status,"active"),
        eq(programMembership.programId,section.programId),
        eq(programMembership.schoolYearId,section.schoolYearId),
      ))
      .where(and(
        eq(enrollments.studentProfileId,current.studentProfileId),
        eq(enrollments.kind,"section"),eq(enrollments.status,"active"),
        eq(enrollments.sectionId,current.sectionId),
        eq(enrollments.programId,section.programId),
        eq(enrollments.schoolYearId,section.schoolYearId),
      )).limit(1);
    if(!authorized)throw new Error("Student does not have current Program and Section enrollment");

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
    draftOnly?: boolean;
  },
): Promise<void> {
  assertCapability(context, "submission.grade");

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: submissions.id,
        status: submissions.status,
        timeliness: submissions.timeliness,
        assessmentId: submissions.assessmentId,pointsPossible:assessments.pointsPossible,
        studentProfileId: submissions.studentProfileId,
        studentPersonId: studentProfiles.personId,
        sectionId: assessments.sectionId,
        programId: sections.programId,schoolYearId: terms.schoolYearId,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(studentProfiles,eq(studentProfiles.id,submissions.studentProfileId))
      .innerJoin(sections,eq(sections.id,assessments.sectionId))
      .innerJoin(terms,eq(terms.id,sections.termId))
      .where(eq(submissions.id, submissionId))
      .limit(1);

    if (!current) throw new Error("Submission not found");
    // Two legitimate teacher contexts exist: host teachers authorized by
    // Site + Program + named assignment, and CAN teachers authorized by
    // their original institution grant + delegated Section + contract.
    // Neither should require an EXTRA global sectionIds grant. Always
    // reauthorize the exact Section INSIDE the grading transaction.
    if ("role" in context && context.role === "teacher") {
      const { authorizeClass } = await import("./class-access.server");
      const actor = context as import("@/modules/identity/actors.server").Actor;
      await authorizeClass(actor, current.sectionId, undefined, tx);
    } else {
      assertSectionScope(context, current.sectionId);
    }
    const enrolled = await currentSectionStudentIds(tx, {
      id: current.sectionId,programId: current.programId,schoolYearId: current.schoolYearId,
    }, current.studentProfileId);
    if (!enrolled.includes(current.studentProfileId))
      throw new Error("Student must have current Program and Section enrollment to receive a grade");
    if (current.status !== "submitted") {
      throw new Error("Only submitted work can be graded");
    }

    const possible = current.pointsPossible === null ? NaN : Number(current.pointsPossible);
    const score = input.score.trim() === "" ? NaN : Number(input.score);
    if (!Number.isFinite(possible) || possible <= 0)
      throw new Error("Assessment has no valid point value");
    if (!Number.isFinite(score) || score < 0 || score > possible)
      throw new Error("Score must be from 0 to "+possible);

    if (input.draftOnly) {
      const [draft] = await tx.update(submissions).set({
        feedback: { gradingDraft: { score: String(score), feedback: input.feedback ?? {}, savedAt: new Date().toISOString() } },
        updatedAt: new Date(),
      }).where(and(eq(submissions.id,submissionId),eq(submissions.status,"submitted"),latestSubmissionCondition(tx)))
        .returning({id:submissions.id});
      if (!draft) throw new Error("Submission changed or a newer attempt exists; reload before saving grading");
      await writeAudit(tx, { actorPersonId:context.actorPersonId,action:"submission.grading_draft_save",
        resourceType:"submission",resourceId:submissionId,scope:{sectionId:current.sectionId},
        after:{status:"submitted",draftSaved:true},context:{requestId:context.requestId??null} });
      await emitEvent(tx,{eventType:EventTypes.SubmissionGradingDraftSaved,aggregateType:"submission",
        aggregateId:submissionId,actorPersonId:context.actorPersonId,
        payload:{sectionId:current.sectionId,assessmentId:current.assessmentId}});
      return;
    }

    const gradedAt = new Date();

    const graded = await tx
      .update(submissions)
      .set({
        status: "graded",
        score: String(score),
        feedback: input.feedback ?? {},
        graderPersonId: context.actorPersonId,
        gradedAt,
        updatedAt: gradedAt,
      })
      .where(and(eq(submissions.id, submissionId), eq(submissions.status, "submitted"),latestSubmissionCondition(tx)))
      .returning({ id: submissions.id });

    if (!graded.length) throw new Error("Submission grading was already processed or a newer attempt exists");

    await emitEvent(tx, {
      eventType: EventTypes.GradePosted,
      aggregateType: "submission",
      aggregateId: submissionId,
      actorPersonId: context.actorPersonId,
      payload: {
        assessmentId: current.assessmentId,
        studentProfileId: current.studentProfileId,
        sectionId: current.sectionId,
        score: String(score),
        timeliness: current.timeliness,
      },
    });

    await notify(tx, {
      recipientPersonId: current.studentPersonId,
      type: "assignment_feedback",
      status: "unread",
      title: "Assignment graded",
      body: "Your teacher posted a grade. Open your assignment to review the score and feedback.",
      resourceType: "submission",
      resourceId: submissionId,
    });

    await writeAudit(tx, {
      actorPersonId: context.actorPersonId,
      action: "submission.grade",
      resourceType: "submission",
      resourceId: submissionId,
      scope: { sectionId: current.sectionId },
      before: { status: current.status },
      after: { status: "graded", score: String(score) },
      context: { requestId: context.requestId ?? null },
    });
  });
}
