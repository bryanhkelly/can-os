import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import {
  STUDENT_LEARNING_GOAL_TYPE, studentLearningGoalActionText, teacherStudentGoalInput,
} from "@/domain/teacher-student-goal";
import { emitEvent, writeAudit } from "@/platform/mutation";

/**
 * Explicit teacher-to-student academic handoff from a private intervention.
 *
 * Reuses the existing Actions table, owning teacher authorization and student's
 * current Section enrollment. Private intervention evidence and observations
 * remain in the original staff-owned Action; only the NEW teacher-approved
 * title/instructions are delivered to the student's own Action list.
 */
export const shareTeacherStudentGoal = createServerFn({ method: "POST" })
  .validator((input: unknown) => teacherStudentGoalInput.parse(input))
  .handler(async ({ data }) => {
    const { getCommandContext } = await import("@/modules/identity/command-context.server");
    const actor = await getCommandContext(getRequest());
    if (actor.role !== "teacher" || !actor.actorPersonId)
      throw new AuthorizationError("verified assigned teacher");
    assertCapability(actor, "teacher:read");
    assertCapability(actor, "action.create");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      // Row lock serializes concurrent publication requests for the same
      // teacher-owned intervention; idempotency does not depend on the client.
      const [source] = await tx.select().from(s.actions)
        .where(eq(s.actions.id, data.teacherActionId)).for("update").limit(1);
      if (!source || source.type !== "academic_intervention" ||
          source.metadata.source !== "teacher_learning_follow_up" ||
          source.subjectType !== "student_profile" ||
          source.ownerPersonId !== actor.actorPersonId ||
          !source.sectionId || !source.programId || !source.siteId ||
          !["open", "in_progress", "waiting"].includes(source.status)) {
        throw new AuthorizationError("active teacher-owned academic follow-up");
      }
      const { assertAcademicActionAuthority } = await import(
        "@/modules/actions/academic-action-policy.server");
      await assertAcademicActionAuthority(tx, actor, source);

      const [student] = await tx.select({ personId: s.studentProfiles.personId })
        .from(s.studentProfiles)
        .where(eq(s.studentProfiles.id, source.subjectId)).limit(1);
      if (!student) throw new AuthorizationError("enrolled student identity");

      const [existing] = await tx.select({ id: s.actions.id })
        .from(s.actions).where(and(
          eq(s.actions.parentActionId, source.id),
          eq(s.actions.ownerPersonId, student.personId),
          eq(s.actions.type, STUDENT_LEARNING_GOAL_TYPE),
        )).limit(1);
      if (existing) return { actionId: existing.id, created: false };

      const safe = studentLearningGoalActionText(data);
      const dueAt = new Date(Date.now() + data.dueInDays * 24 * 60 * 60_000);
      const [goal] = await tx.insert(s.actions).values({
        type: STUDENT_LEARNING_GOAL_TYPE,
        status: "open", priority: "normal",
        title: safe.title, description: safe.description,
        ownerPersonId: student.personId,
        organizationId: source.organizationId, siteId: source.siteId,
        programId: source.programId, sectionId: source.sectionId,
        subjectType: "student_profile", subjectId: source.subjectId,
        parentActionId: source.id, dueAt,
        // Only a safe source marker, no intervention observations, original
        // evidence, concerns, or counselor/safeguarding record references.
        metadata: { source: "teacher_shared_learning_goal" },
      }).returning({ id: s.actions.id });
      if (!goal) throw new Error("Unable to create student learning goal");
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated, aggregateType: "action",
        aggregateId: goal.id, actorPersonId: actor.actorPersonId,
        organizationId: source.organizationId, siteId: source.siteId,
        programId: source.programId, sectionId: source.sectionId,
        payload: { source: "teacher_shared_learning_goal", recipientPersonId: student.personId },
      });
      await writeAudit(tx, actor, {
        action: "student.learning_goal.shared",
        entityType: "action", entityId: goal.id,
        scope: { organizationId: source.organizationId, siteId: source.siteId,
          programId: source.programId, sectionId: source.sectionId },
        after: { studentPersonId: student.personId, parentActionId: source.id,
          dueAt: dueAt.toISOString(), confirmedStudentSafe: data.confirmedStudentSafe },
      });
      return { actionId: goal.id, created: true };
    });
  });
