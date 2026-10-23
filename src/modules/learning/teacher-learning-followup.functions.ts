import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { teacherLearningFollowUpInput } from "@/domain/teacher-learning-followup";
import { authorizeClass } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

/**
 * A teacher deliberately initiates a bounded, evidence-backed intervention
 * using the existing academic_intervention Action lifecycle.
 *
 * No inferred student risk, automatic guardian notification, or new support
 * record is created. The teacher remains the owner and must record an outcome.
 */
export const createTeacherLearningFollowUp = createServerFn({ method: "POST" })
  .validator((input: unknown) => teacherLearningFollowUpInput.parse(input))
  .handler(async ({ data }) => {
    const { getCommandContext } = await import("@/modules/identity/command-context.server");
    const actor = await getCommandContext(getRequest());
    if (actor.role !== "teacher" || !actor.actorPersonId)
      throw new AuthorizationError("assigned teacher required");
    assertCapability(actor, "teacher:read");
    assertCapability(actor, "action.create");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [section] = await tx.select({
        id: s.sections.id, siteId: s.sections.siteId,
        programId: s.sections.programId, title: s.sections.title,
        versionId: s.sections.courseTemplateVersionId,
        organizationId: s.programs.organizationId,
        schoolYearId:s.terms.schoolYearId,
      }).from(s.sections).innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
        .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
        .innerJoin(s.sectionTeachers, and(
          eq(s.sectionTeachers.sectionId, s.sections.id),
          eq(s.sectionTeachers.personId, actor.actorPersonId!),
        )).where(and(
          eq(s.sections.id, data.sectionId), eq(s.sections.active, true),
        )).limit(1);
      if (!section || !section.siteId)
        throw new AuthorizationError("assigned active section");
      // CAN staff on independently hosted sites receive a named teaching
      // Section, not church-wide Program/Site authority. Use the identical
      // class authorizer as gradebook and lesson delivery within this txn.
      await authorizeClass(actor as Actor,section.id,undefined,tx);
      const [student] = await tx.select({
        id: s.studentProfiles.id,
      }).from(s.enrollments)
        .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.enrollments.studentProfileId))
        .where(and(eq(s.enrollments.sectionId, section.id),
          eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"),
          eq(s.studentProfiles.id, data.studentProfileId)))
        .limit(1);
      if (!student) throw new AuthorizationError("currently enrolled student");
      const [currentProgramEnrollment]=await tx.select({id:s.enrollments.id})
        .from(s.enrollments)
        .where(and(eq(s.enrollments.schoolYearId,section.schoolYearId),
          eq(s.enrollments.studentProfileId,student.id),
          eq(s.enrollments.programId,section.programId),
          eq(s.enrollments.kind,"program"),
          eq(s.enrollments.status,"active")))
        .limit(1);
      if(!currentProgramEnrollment)
        throw new AuthorizationError("active same-year Program enrollment");

      const event = (await tx.select({
        id: s.learningActivityEvents.id, lessonId: s.learningActivityEvents.lessonId,
        kind: s.learningActivityEvents.kind, receivedAt: s.learningActivityEvents.receivedAt,
      }).from(s.learningActivityEvents).where(and(
        eq(s.learningActivityEvents.id, data.learningEventId),
        eq(s.learningActivityEvents.studentProfileId, student.id),
        eq(s.learningActivityEvents.sectionId, section.id),
        eq(s.learningActivityEvents.courseTemplateVersionId, section.versionId),
        gte(s.learningActivityEvents.receivedAt, new Date(Date.now() - 7 * 24 * 60 * 60_000)),
      )).limit(1))[0];
      if (!event) throw new AuthorizationError("recent authorized learning evidence");

      const key = `teacher-learning-follow-up:${event.id}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
      const [existing] = await tx.select({ id: s.actions.id })
        .from(s.actions).where(and(
          eq(s.actions.type, "academic_intervention"),
          eq(s.actions.subjectType, "student_profile"),
          eq(s.actions.subjectId, student.id),
          eq(s.actions.sectionId, section.id),
          inArray(s.actions.status, ["open", "in_progress", "waiting"]),
          sql`${s.actions.metadata} ->> 'learningEventId' = ${event.id}`,
        )).limit(1);
      if (existing) return { actionId: existing.id, created: false };

      const now = new Date();
      const dueAt = new Date(now.getTime() + data.dueInDays * 24 * 60 * 60_000);
      const [action] = await tx.insert(s.actions).values({
        type: "academic_intervention", status: "open", priority: "normal",
        title: `Teacher learning follow-up: ${section.title}`,
        description: data.observation,
        ownerPersonId: actor.actorPersonId,
        organizationId: section.organizationId, siteId: section.siteId,
        programId: section.programId, sectionId: section.id,
        subjectType: "student_profile", subjectId: student.id,
        dueAt,
        evidence: [{
          source: "learning_activity", eventId: event.id,
          kind: event.kind, lessonId: event.lessonId, recordedAt: event.receivedAt.toISOString(),
          limitations: "Observed interaction only; not proof of engagement, mastery or attendance",
        }],
        metadata: {
          source: "teacher_learning_follow_up", learningEventId: event.id,
          approach: data.approach, createdByTeacherId: actor.actorPersonId,
        },
      }).returning({ id: s.actions.id });
      if (!action) throw new Error("Could not create follow-up Action");
      await emitEvent(tx, {
        eventType: EventTypes.ActionCreated, aggregateType: "action", aggregateId: action.id,
        actorPersonId: actor.actorPersonId,
        organizationId: section.organizationId, siteId: section.siteId,
        programId: section.programId, sectionId: section.id,
        payload: { source: "teacher_learning_follow_up", learningEventId: event.id },
      });
      await writeAudit(tx, actor, {
        action: "teacher.learning_follow_up.created",
        entityType: "action", entityId: action.id,
        scope: { organizationId: section.organizationId, siteId: section.siteId,
          programId: section.programId, sectionId: section.id },
        after: { studentProfileId: student.id, learningEventId: event.id,
          approach: data.approach, dueAt: dueAt.toISOString() },
      });
      return { actionId: action.id, created: true };
    });
  });
