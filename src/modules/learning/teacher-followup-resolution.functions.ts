import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { STUDENT_LEARNING_GOAL_TYPE } from "@/domain/teacher-student-goal";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { accessibleClasses } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import {
  teacherFollowUpResolutionInput,
  teacherFollowUpResolutionNote,
} from "@/domain/teacher-learning-followup";

async function teacherActor() {
  const { getCommandContext } = await import("@/modules/identity/command-context.server");
  const actor = await getCommandContext(getRequest());
  if (actor.role !== "teacher" || !actor.actorPersonId)
    throw new AuthorizationError("verified teacher required");
  assertCapability(actor, "teacher:read");
  if (!(actor.scope.siteIds?.length && actor.scope.programIds?.length) &&
      !actor.scope.sectionIds?.length)
    throw new AuthorizationError("authorized named teaching Section");
  return { ...actor, actorPersonId: actor.actorPersonId };
}

/**
 * One Action queue, not a parallel intervention system. Only active enrollments
 * taught by the current teacher can be read. Recently completed actions retain
 * their teacher-documented outcome for review.
 */
export const getTeacherLearningFollowUps = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await teacherActor();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const sectionIds=(await accessibleClasses(actor as Actor)).map(row=>row.id);
    if(!sectionIds.length)return {items:[],truncated:false,
      note:"No current named and authorized teaching Sections."};
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60_000);
    const activeProgram=alias(s.enrollments,"followup_active_program");
    const rows = await db.select({
      id: s.actions.id, title: s.actions.title, description: s.actions.description,
      status: s.actions.status, dueAt: s.actions.dueAt,
      resolvedAt: s.actions.resolvedAt, resolutionNote: s.actions.resolutionNote,
      metadata: s.actions.metadata, sectionId: s.sections.id,
      sectionTitle: s.sections.title,
      studentProfileId: s.studentProfiles.id,
      studentPersonId: s.studentProfiles.personId,
      firstName: s.people.legalFirstName, lastName: s.people.legalLastName,
    }).from(s.actions)
      .innerJoin(s.sections, and(
        eq(s.actions.sectionId, s.sections.id), eq(s.sections.active, true),
      ))
      .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
      .innerJoin(s.sectionTeachers, and(
        eq(s.sectionTeachers.sectionId, s.sections.id),
        eq(s.sectionTeachers.personId, actor.actorPersonId),
      ))
      .innerJoin(s.studentProfiles, eq(s.actions.subjectId, s.studentProfiles.id))
      .innerJoin(s.people, eq(s.people.id, s.studentProfiles.personId))
      .innerJoin(s.enrollments, and(
        eq(s.enrollments.sectionId, s.sections.id),
        eq(s.enrollments.studentProfileId, s.studentProfiles.id),
        eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
      ))
      .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
      .innerJoin(activeProgram,and(
        eq(activeProgram.studentProfileId,s.enrollments.studentProfileId),
        eq(activeProgram.programId,s.sections.programId),
        eq(activeProgram.schoolYearId,s.terms.schoolYearId),
        eq(activeProgram.kind,"program"),eq(activeProgram.status,"active"),
      ))
      .where(and(
        eq(s.actions.type, "academic_intervention"),
        eq(s.actions.subjectType, "student_profile"),
        eq(s.actions.ownerPersonId, actor.actorPersonId),
        inArray(s.actions.status, ["open", "in_progress", "waiting", "resolved"]),
        or(inArray(s.actions.status, ["open", "in_progress", "waiting"]),
          gte(s.actions.resolvedAt, recent)),
        sql`${s.actions.metadata} ->> 'source' = 'teacher_learning_follow_up'`,
        eq(s.actions.organizationId, s.programs.organizationId),
        eq(s.actions.programId, s.sections.programId),
        eq(s.actions.siteId, s.sections.siteId),
        eq(s.enrollments.schoolYearId,s.terms.schoolYearId),
        inArray(s.sections.id,sectionIds),
      ))
      .orderBy(asc(s.actions.dueAt), desc(s.actions.createdAt)).limit(101);
    const parentIds = rows.map(row => row.id);
    const goalRows = parentIds.length ? await db.select({
      id: s.actions.id, parentActionId: s.actions.parentActionId,
      ownerPersonId: s.actions.ownerPersonId, subjectId: s.actions.subjectId,
      status: s.actions.status,
    }).from(s.actions).where(and(
      eq(s.actions.type, STUDENT_LEARNING_GOAL_TYPE),
      inArray(s.actions.parentActionId, parentIds),
    )).limit(101) : [];
    const goalByParent = new Map(goalRows.map(goal => [goal.parentActionId, goal]));
    return {
      items: rows.slice(0, 100).map(row => ({
        id: row.id, title: row.title, description: row.description,
        status: row.status, dueAt: row.dueAt?.toISOString() ?? null,
        resolvedAt: row.resolvedAt?.toISOString() ?? null,
        resolutionNote: row.resolutionNote,
        sectionId: row.sectionId, sectionTitle: row.sectionTitle,
        studentProfileId: row.studentProfileId, studentPersonId: row.studentPersonId,
        studentName: `${row.firstName} ${row.lastName}`,
        studentGoal: (() => {
          const goal = goalByParent.get(row.id);
          return goal && goal.ownerPersonId === row.studentPersonId &&
            goal.subjectId === row.studentProfileId
            ? { id: goal.id, status: goal.status } : null;
        })(),
        approach: typeof row.metadata.approach === "string" ? row.metadata.approach : "check_in",
      })),
      truncated: rows.length > 100,
      note: "Teacher-authored support records, not an automated evaluation of learning, attendance or mastery.",
    };
  });

/**
 * The existing Action resolver owns the transition, audit and domain event.
 * Teachers may only resolve their OWN currently assigned learning follow-ups;
 * their actual support and outcome are required and committed atomically.
 */
export const resolveTeacherLearningFollowUp = createServerFn({ method: "POST" })
  .validator((input: unknown) => teacherFollowUpResolutionInput.parse(input))
  .handler(async ({ data }) => {
    const actor = await teacherActor();
    assertCapability(actor, "action.resolve");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [current] = await tx.select().from(s.actions)
        .where(eq(s.actions.id, data.actionId)).for("update").limit(1);
      if (!current || current.type !== "academic_intervention" ||
          current.subjectType !== "student_profile" ||
          current.metadata.source !== "teacher_learning_follow_up" ||
          current.ownerPersonId !== actor.actorPersonId) {
        throw new AuthorizationError("teacher-owned learning follow-up");
      }
      const { assertAcademicActionAuthority } = await import(
        "@/modules/actions/academic-action-policy.server");
      await assertAcademicActionAuthority(tx, actor, current);
      if (current.status === "resolved") return { saved: true, alreadyResolved: true };
      if (current.status === "cancelled") throw new Error("Cancelled follow-up cannot be resolved");

      const note = teacherFollowUpResolutionNote(data);
      const completedAt = new Date();
      await tx.update(s.actions).set({
        metadata: {
          ...current.metadata,
          followUpResult: {
            supportProvided: data.supportProvided,
            outcome: data.outcome,
            outcomeEvidence: data.outcomeEvidence,
            completedAt: completedAt.toISOString(),
          },
        },
      }).where(eq(s.actions.id, current.id));

      const { resolveActionInTransaction } = await import("@/modules/actions/resolve-action");
      await resolveActionInTransaction(tx, actor, {
        actionId: current.id, resolutionNote: note,
      });
      return { saved: true, alreadyResolved: false };
    });
  });
