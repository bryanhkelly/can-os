import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { recordAudit } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { authorizeClass, classActor } from "./class-access.server";

export const publishClassAnnouncement = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    id: z.string().uuid(), sectionId: z.string().uuid(), title: z.string().trim().min(3).max(160),
    body: z.string().trim().min(1).max(5000),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await classActor();
    if (actor.role !== "teacher") throw new AuthorizationError("class announcement teacher");
    assertCapability(actor, "communication.send");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { section } = await authorizeClass(actor, data.sectionId, undefined, tx);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"announcement:"+data.id}))`);
      const [existing] = await tx.select().from(s.communicationThreads).where(eq(s.communicationThreads.id, data.id)).limit(1);
      if (existing) {
        if (existing.contextType !== "section" || existing.contextId !== section.id ||
          existing.createdByPersonId !== actor.actorPersonId || existing.metadata.kind !== "class_announcement") {
          throw new AuthorizationError("announcement identity");
        }
        const [message] = await tx.select({ body: s.communicationMessages.body }).from(s.communicationMessages)
          .where(eq(s.communicationMessages.threadId, existing.id)).limit(1);
        if (existing.subject !== data.title || message?.body !== data.body) throw new Error("This announcement request was already used with different content.");
        return { id: existing.id };
      }
      const now = new Date();
      await tx.insert(s.communicationThreads).values({
        id: data.id, subject: data.title, contextType: "section", contextId: section.id,
        createdByPersonId: actor.actorPersonId, lastMessageAt: now, metadata: { kind: "class_announcement" },
      });
      await tx.insert(s.communicationMessages).values({ threadId: data.id, senderPersonId: actor.actorPersonId, body: data.body });
      await recordAudit(tx, actor, { action: "learning.announcement_publish", resourceType: "communication_thread", resourceId: data.id,
        after: { sectionId: section.id, title: data.title }, scope: { siteId: section.siteId, programId: section.programId } });
      await emitEvent(tx, { eventType: EventTypes.ClassAnnouncementPublished, aggregateType: "communication_thread", aggregateId: data.id,
        actorPersonId: actor.actorPersonId, payload: { sectionId: section.id } });
      return { id: data.id };
    });
  });

export const startAssignmentConversation = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().uuid(), studentPersonId: z.string().uuid().optional(),
    body: z.string().trim().min(1).max(4000), messageId: z.string().uuid(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await classActor();
    assertCapability(actor, "communication.send");
    const targetPersonId = actor.role === "student" ? actor.actorPersonId : data.studentPersonId;
    if (!targetPersonId || (actor.role === "student" && data.studentPersonId && data.studentPersonId !== targetPersonId)) {
      throw new AuthorizationError("assignment student");
    }
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const [assessment] = await tx.select({ id: s.assessments.id, title: s.assessments.title, sectionId: s.assessments.sectionId })
        .from(s.assessments).where(and(eq(s.assessments.id, data.assessmentId), sql`${s.assessments.status} in ('published', 'closed')`)).limit(1);
      if (!assessment) throw new AuthorizationError("published assessment");
      const { section } = await authorizeClass(actor, assessment.sectionId, targetPersonId, tx);
      const [enrolled] = await tx.select({ id: s.studentProfiles.id }).from(s.studentProfiles)
        .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
        .where(and(eq(s.studentProfiles.personId, targetPersonId), eq(s.enrollments.sectionId, section.id),
          eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"))).limit(1);
      if (!enrolled) throw new AuthorizationError("enrolled student conversation");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"assignment-conversation:"+assessment.id+":"+enrolled.id}))`);
      const [existing] = await tx.select({ id: s.communicationThreads.id }).from(s.communicationThreads)
        .where(and(eq(s.communicationThreads.contextType, "assessment"), eq(s.communicationThreads.contextId, assessment.id),
          sql`${s.communicationThreads.metadata}->>'studentProfileId' = ${enrolled.id}`,
          sql`${s.communicationThreads.metadata}->>'kind' = 'academic_conversation'`)).limit(1);
      let threadId = existing?.id;
      if (!threadId) {
        const [thread] = await tx.insert(s.communicationThreads).values({
          subject: `${section.title} · ${assessment.title}`.slice(0, 200), contextType: "assessment", contextId: assessment.id,
          createdByPersonId: actor.actorPersonId, metadata: { kind: "academic_conversation", studentProfileId: enrolled.id },
        }).returning({ id: s.communicationThreads.id });
        if (!thread) throw new Error("Unable to create assignment conversation.");
        threadId = thread.id;
      }
      const guardians = await tx.select({ personId: s.guardianRelationships.guardianPersonId }).from(s.guardianRelationships)
        .where(guardianRelationshipPredicate({ studentPersonId: targetPersonId, access: "academic" }));
      const teachers = await tx.select({ personId: s.sectionTeachers.personId }).from(s.sectionTeachers)
        .where(eq(s.sectionTeachers.sectionId, section.id));
      if (!teachers.length) throw new Error("No teaching team is assigned to this class.");
      const participants = [...new Set([targetPersonId, ...guardians.map(row => row.personId), ...teachers.map(row => row.personId)])];
      if (!participants.includes(actor.actorPersonId)) throw new AuthorizationError("assignment conversation participant");
      const [priorMessage] = await tx.select({ threadId: s.communicationMessages.threadId, sender: s.communicationMessages.senderPersonId,
        body: s.communicationMessages.body }).from(s.communicationMessages).where(eq(s.communicationMessages.id, data.messageId)).limit(1);
      if (priorMessage) {
        if (priorMessage.threadId !== threadId || priorMessage.sender !== actor.actorPersonId || priorMessage.body !== data.body) {
          throw new Error("This message request was already used with different content.");
        }
        return { threadId };
      }
      await tx.insert(s.communicationParticipants).values(participants.map(participantId => ({
        threadId: threadId!, participantType: "person" as const, participantId,
      }))).onConflictDoNothing();
      await tx.insert(s.communicationMessages).values({ id: data.messageId, threadId, senderPersonId: actor.actorPersonId, body: data.body });
      await tx.update(s.communicationThreads).set({ lastMessageAt: new Date(), updatedAt: new Date() }).where(eq(s.communicationThreads.id, threadId));
      await recordAudit(tx, actor, { action: "communication.assignment_message", resourceType: "communication_message", resourceId: data.messageId,
        after: { threadId, assessmentId: assessment.id, studentProfileId: enrolled.id }, scope: { sectionId: section.id, siteId: section.siteId, programId: section.programId } });
      await emitEvent(tx, { eventType: EventTypes.CommunicationMessageSent, aggregateType: "communication_thread", aggregateId: threadId,
        actorPersonId: actor.actorPersonId, payload: { assessmentId: assessment.id, studentProfileId: enrolled.id, sectionId: section.id } });
      return { threadId };
    });
  });
