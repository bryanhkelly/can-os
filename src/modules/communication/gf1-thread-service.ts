import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  assessments,
  auditEvents,
  communicationMessages,
  communicationParticipants,
  communicationThreads,
  domainEvents,
  guardianRelationships,
  people,
  sectionTeachers,
  studentProfiles,
  submissions,
} from "@/db/schema";
import {
  assertCapability,
  assertSectionScope,
  type CommandContext,
} from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";

export async function sendAcademicInterventionMessage(
  context: CommandContext,
  input: {
    submissionId: string;
    body: string;
  },
): Promise<string> {
  assertCapability(context, "communication.send");
  if (!context.actorPersonId) throw new Error("A human actor is required to send a message");
  const actorPersonId = context.actorPersonId;

  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({
        submissionId: submissions.id,
        assessmentTitle: assessments.title,
        sectionId: assessments.sectionId,
        studentPersonId: studentProfiles.personId,
        studentPreferredName: people.preferredName,
        studentFirstName: people.legalFirstName,
      })
      .from(submissions)
      .innerJoin(assessments, eq(assessments.id, submissions.assessmentId))
      .innerJoin(
        studentProfiles,
        eq(studentProfiles.id, submissions.studentProfileId),
      )
      .innerJoin(people, eq(people.id, studentProfiles.personId))
      .where(eq(submissions.id, input.submissionId))
      .limit(1);

    if (!record) throw new Error("Submission not found");
    assertSectionScope(context, record.sectionId);

    const [existing] = await tx
      .select({ id: communicationThreads.id })
      .from(communicationThreads)
      .where(
        and(
          eq(communicationThreads.contextType, "submission"),
          eq(communicationThreads.contextId, record.submissionId),
        ),
      )
      .limit(1);

    let threadId = existing?.id;

    if (!threadId) {
      const studentName =
        record.studentPreferredName ?? record.studentFirstName;

      const [thread] = await tx
        .insert(communicationThreads)
        .values({
          subject: `${studentName} · ${record.assessmentTitle}`,
          contextType: "submission",
          contextId: record.submissionId,
          createdByPersonId: actorPersonId,
        })
        .returning({ id: communicationThreads.id });

      if (!thread) throw new Error("Failed to create communication thread");
      threadId = thread.id;

      const guardians = await tx
        .select({ personId: guardianRelationships.guardianPersonId })
        .from(guardianRelationships)
        .where(
          and(
            eq(guardianRelationships.studentPersonId, record.studentPersonId),
            eq(guardianRelationships.canViewAcademics, true),
          ),
        );

      const teachers = await tx
        .select({ personId: sectionTeachers.personId })
        .from(sectionTeachers)
        .where(eq(sectionTeachers.sectionId, record.sectionId));

      const participantIds = new Set([
        record.studentPersonId,
        ...guardians.map((row) => row.personId),
        ...teachers.map((row) => row.personId),
      ]);

      const createdThreadId = threadId;
      await tx.insert(communicationParticipants).values(
        [...participantIds].map((participantId) => ({
          threadId: createdThreadId,
          participantType: "person" as const,
          participantId,
        })),
      );
    }

    const [participant] = await tx
      .select({ id: communicationParticipants.id })
      .from(communicationParticipants)
      .where(
        and(
          eq(communicationParticipants.threadId, threadId),
          eq(communicationParticipants.participantType, "person"),
          eq(communicationParticipants.participantId, actorPersonId),
        ),
      )
      .limit(1);

    if (!participant) {
      throw new Error("Actor is not a participant in this thread");
    }

    await tx.insert(communicationMessages).values({
      threadId,
      senderPersonId: actorPersonId,
      body: input.body,
    });

    const sentAt = new Date();

    await tx
      .update(communicationThreads)
      .set({ lastMessageAt: sentAt, updatedAt: sentAt })
      .where(eq(communicationThreads.id, threadId));

    await tx.insert(domainEvents).values({
      eventType: EventTypes.CommunicationMessageSent,
      aggregateType: "communication_thread",
      aggregateId: threadId,
      actorPersonId: actorPersonId,
      payload: {
        submissionId: record.submissionId,
        sectionId: record.sectionId,
      },
    });

    await tx.insert(auditEvents).values({
      actorPersonId: actorPersonId,
      action: "communication.message_send",
      resourceType: "communication_thread",
      resourceId: threadId,
      scope: { sectionId: record.sectionId },
      after: { sent: true },
      context: {
        requestId: context.requestId ?? null,
        submissionId: record.submissionId,
      },
    });

    return threadId;
  });
}
