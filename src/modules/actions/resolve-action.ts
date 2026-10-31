import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { actions, assessments, submissions, studentProfiles, guardianRelationships } from "@/db/schema";
import {
  assertCapability,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import { gradeResponseActionType } from "@/domain/grade-response-policy";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { assertAcademicActionAuthority } from "./academic-action-policy.server";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ResolutionInput = { actionId: string; resolutionNote: string };

export async function resolveAction(
  context: CommandContext,
  input: ResolutionInput,
): Promise<void> {
  await db.transaction(tx => resolveActionInTransaction(tx, context, input));
}

export async function resolveActionInTransaction(
  tx: Tx,
  context: CommandContext,
  input: ResolutionInput,
): Promise<void> {
  assertCapability(context, "action.resolve");
  const resolutionNote = input.resolutionNote.trim();
  if (!resolutionNote) throw new Error("Resolution note required");

  const [current] = await tx
    .select()
    .from(actions)
    .where(eq(actions.id, input.actionId))
    .for("update")
    .limit(1);

  if (!current) throw new Error("Action not found");
  const gradeResponse = current.type === gradeResponseActionType;
  if (current.type !== "academic_intervention" && !gradeResponse) {
    throw new Error("Use the Action's owning domain lifecycle");
  }
  await assertAcademicActionAuthority(tx, context, current);
  let guardianRecipient: string | null = null;
  if (gradeResponse) {
    const submissionId = current.metadata.submissionId;
    const guardianId = current.metadata.requestedByGuardianPersonId;
    if (typeof submissionId !== "string" || typeof guardianId !== "string")
      throw new Error("Grade follow-up is missing its original request");
    const [submission] = await tx.select({ studentPersonId: studentProfiles.personId })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(studentProfiles, eq(studentProfiles.id, submissions.studentProfileId))
      .where(and(eq(submissions.id, submissionId),
        eq(submissions.studentProfileId, current.subjectId),
        eq(assessments.sectionId, current.sectionId!),
        inArray(submissions.status, ["graded", "returned"]))).limit(1);
    if (!submission) throw new Error("Grade follow-up does not match released student work");
    guardianRecipient = guardianId;
    if (current.status === "resolved" && current.resolutionNote !== resolutionNote)
      throw new Error("The recorded school response cannot be overwritten");
  }
  if (current.status === "resolved") return;
  if (current.status === "cancelled") throw new Error("Cancelled Action cannot be resolved");

  const resolvedAt = new Date();

  await tx
    .update(actions)
    .set({
      status: "resolved",
      resolutionNote,
      resolvedAt,
      updatedAt: resolvedAt,
    })
    .where(eq(actions.id, input.actionId));

  await emitEvent(tx, {
    eventType: EventTypes.ActionResolved,
    aggregateType: "action",
    aggregateId: input.actionId,
    actorPersonId: context.actorPersonId,
    payload: {
      subjectType: current.subjectType,
      subjectId: current.subjectId,
    },
  });

  await writeAudit(tx, context, {
    action: "action.resolve",
    entityType: "action",
    entityId: input.actionId,
    scope: {
      organizationId: current.organizationId,
      siteId: current.siteId,
      programId: current.programId,
      sectionId: current.sectionId,
    },
    before: { status: current.status },
    after: { status: "resolved", resolutionNote },
  });
  if (guardianRecipient) {
    const [related] = await tx.select({ id: guardianRelationships.id })
      .from(guardianRelationships)
      .innerJoin(studentProfiles, eq(studentProfiles.personId, guardianRelationships.studentPersonId))
      .where(and(eq(studentProfiles.id, current.subjectId),
        guardianRelationshipPredicate({
          guardianPersonId: guardianRecipient,
          studentPersonId: studentProfiles.personId, access: "academic",
        }))).limit(1);
    if (related) await notify(tx, {
      recipientPersonId: guardianRecipient, type: "guardian_grade_follow_up_resolved",
      title: "Your school responded to your academic question",
      body: "Review the school's resolution in your child's academic progress.",
      resourceType: "action", resourceId: current.id,
    });
  }
}
