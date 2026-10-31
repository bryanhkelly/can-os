import { and, eq } from "drizzle-orm";
import {
  communicationParticipants,
  communicationThreads,
} from "@/db/schema";
import { EventTypes } from "@/domain/event-types";
import type {
  DomainEventRecord,
  NotificationPlan,
  NotificationPolicy,
  PolicyTx,
} from "@/platform/notifications/policy";

/**
 * Policy for EventTypes.CommunicationMessageSent: every person participating
 * in the thread except the sender is notified. Emission sites attach
 * different payload subsets (thread reply, new thread, assignment
 * conversation), so the policy relies only on the durable common subset —
 * the thread aggregate id and the sender actor — and skips the event when
 * the aggregate is gone or is not a communication thread.
 */
export type CommunicationMessageSentContext = {
  threadId: string;
  threadSubject: string;
  senderPersonId: string | null;
  participantPersonIds: string[];
};

export const communicationMessageSentPolicy: NotificationPolicy<CommunicationMessageSentContext> = {
  eventType: EventTypes.CommunicationMessageSent,

  async load(tx: PolicyTx, event: DomainEventRecord) {
    if (event.aggregateType !== "communication_thread") return null;

    const [thread] = await tx
      .select({
        id: communicationThreads.id,
        subject: communicationThreads.subject,
      })
      .from(communicationThreads)
      .where(eq(communicationThreads.id, event.aggregateId))
      .limit(1);

    if (!thread) return null;

    const participants = await tx
      .select({ personId: communicationParticipants.participantId })
      .from(communicationParticipants)
      .where(
        and(
          eq(communicationParticipants.threadId, thread.id),
          eq(communicationParticipants.participantType, "person"),
        ),
      );

    return {
      threadId: thread.id,
      threadSubject: thread.subject,
      senderPersonId: event.actorPersonId,
      participantPersonIds: participants.map((row) => row.personId),
    };
  },

  plans(context: CommunicationMessageSentContext): NotificationPlan[] {
    const recipients = new Set(context.participantPersonIds);
    if (context.senderPersonId) recipients.delete(context.senderPersonId);

    return [...recipients].map((recipientPersonId) => ({
      recipientPersonId,
      type: "communication_message_received",
      title: `New message: ${context.threadSubject}`,
      body: "You have a new message. Open Messages to read it and reply.",
      resourceType: "communication_thread",
      resourceId: context.threadId,
    }));
  },
};
