import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import {
  assertSyntheticMutation,
  demoAllowedRoles,
  type DemoRole,
} from "@/modules/student-experience/demo-write-gate";

/**
 * Contextual messaging surface (GF1 step 12, Experience Flow N1).
 * Thread access is derived from verified communicationParticipants membership,
 * never from a browser-supplied actor claim. Reads require an authenticated
 * person; writes additionally require the communication.send capability.
 */

const MAX_BODY_LENGTH = 4000;
const SNIPPET_LENGTH = 120;

const threadIdSchema = z.string().uuid();

function requireActorPerson(actorPersonId: string | null): string {
  if (!actorPersonId) throw new AuthorizationError("authenticated person");
  return actorPersonId;
}

function snippet(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > SNIPPET_LENGTH
    ? `${compact.slice(0, SNIPPET_LENGTH)}…`
    : compact;
}

async function assertParticipant(
  db: typeof import("@/db/client").db,
  s: typeof import("@/db/schema"),
  threadId: string,
  actorPersonId: string,
): Promise<void> {
  const [participant] = await db
    .select({ id: s.communicationParticipants.id })
    .from(s.communicationParticipants)
    .where(
      and(
        eq(s.communicationParticipants.threadId, threadId),
        eq(s.communicationParticipants.participantType, "person"),
        eq(s.communicationParticipants.participantId, actorPersonId),
      ),
    )
    .limit(1);
  if (!participant) throw new AuthorizationError("communication thread participation");
}

export const listMyThreads = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getCommandContext(getRequest());
  setResponseHeader("Cache-Control", "private, no-store");
  const actorPersonId = requireActorPerson(context.actorPersonId);
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

  const threads = await db
    .select({
      id: s.communicationThreads.id,
      subject: s.communicationThreads.subject,
      contextType: s.communicationThreads.contextType,
      lastMessageAt: s.communicationThreads.lastMessageAt,
      createdAt: s.communicationThreads.createdAt,
    })
    .from(s.communicationParticipants)
    .innerJoin(
      s.communicationThreads,
      eq(s.communicationThreads.id, s.communicationParticipants.threadId),
    )
    .where(
      and(
        eq(s.communicationParticipants.participantType, "person"),
        eq(s.communicationParticipants.participantId, actorPersonId),
      ),
    );

  if (!threads.length) return { threads: [] };

  const latest = await db
    .select({
      threadId: s.communicationMessages.threadId,
      body: s.communicationMessages.body,
      sentAt: s.communicationMessages.sentAt,
    })
    .from(s.communicationMessages)
    .where(
      inArray(
        s.communicationMessages.threadId,
        threads.map((thread) => thread.id),
      ),
    )
    .orderBy(desc(s.communicationMessages.sentAt));

  const snippetByThread = new Map<string, string>();
  for (const message of latest) {
    if (!snippetByThread.has(message.threadId)) {
      snippetByThread.set(message.threadId, snippet(message.body));
    }
  }

  return {
    threads: threads
      .map((thread) => ({
        id: thread.id,
        subject: thread.subject,
        contextType: thread.contextType,
        lastMessageAt: (thread.lastMessageAt ?? thread.createdAt).toISOString(),
        snippet: snippetByThread.get(thread.id) ?? "",
      }))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt)),
  };
});

export const getThread = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ threadId: threadIdSchema }).parse(value))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    const actorPersonId = requireActorPerson(context.actorPersonId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

    await assertParticipant(db, s, data.threadId, actorPersonId);

    const [thread] = await db
      .select({
        id: s.communicationThreads.id,
        subject: s.communicationThreads.subject,
        contextType: s.communicationThreads.contextType,
        contextId: s.communicationThreads.contextId,
        lastMessageAt: s.communicationThreads.lastMessageAt,
      })
      .from(s.communicationThreads)
      .where(eq(s.communicationThreads.id, data.threadId))
      .limit(1);
    if (!thread) throw new Error("Thread not found");

    const rows = await db
      .select({
        id: s.communicationMessages.id,
        body: s.communicationMessages.body,
        sentAt: s.communicationMessages.sentAt,
        senderPersonId: s.communicationMessages.senderPersonId,
        preferredName: s.people.preferredName,
        legalFirstName: s.people.legalFirstName,
      })
      .from(s.communicationMessages)
      .innerJoin(s.people, eq(s.people.id, s.communicationMessages.senderPersonId))
      .where(eq(s.communicationMessages.threadId, data.threadId))
      .orderBy(asc(s.communicationMessages.sentAt));

    return {
      thread: {
        id: thread.id,
        subject: thread.subject,
        contextType: thread.contextType,
        contextId: thread.contextId,
      },
      messages: rows.map((row) => ({
        id: row.id,
        body: row.body,
        sentAt: row.sentAt.toISOString(),
        senderName: row.preferredName ?? row.legalFirstName,
        own: row.senderPersonId === actorPersonId,
      })),
    };
  });

export const replyToThread = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        threadId: threadIdSchema,
        body: z
          .string()
          .trim()
          .min(1, "Message must not be empty")
          .max(MAX_BODY_LENGTH, `Message must be ${MAX_BODY_LENGTH} characters or fewer`),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    assertCapability(context, "communication.send");
    const role = context.role;
    if (!role || !(demoAllowedRoles as readonly string[]).includes(role)) {
      throw new AuthorizationError("demo role");
    }
    assertSyntheticMutation(role as DemoRole);
    const actorPersonId = requireActorPerson(context.actorPersonId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

    return db.transaction(async (tx) => {
      const [thread] = await tx
        .select({ id: s.communicationThreads.id })
        .from(s.communicationThreads)
        .where(eq(s.communicationThreads.id, data.threadId))
        .for("update")
        .limit(1);
      if (!thread) throw new Error("Thread not found");

      const [participant] = await tx
        .select({ id: s.communicationParticipants.id })
        .from(s.communicationParticipants)
        .where(
          and(
            eq(s.communicationParticipants.threadId, thread.id),
            eq(s.communicationParticipants.participantType, "person"),
            eq(s.communicationParticipants.participantId, actorPersonId),
          ),
        )
        .limit(1);
      if (!participant) {
        throw new AuthorizationError("communication thread participation");
      }

      const [message] = await tx
        .insert(s.communicationMessages)
        .values({
          threadId: thread.id,
          senderPersonId: actorPersonId,
          body: data.body,
        })
        .returning({ id: s.communicationMessages.id, sentAt: s.communicationMessages.sentAt });
      if (!message) throw new Error("Failed to send message");

      const sentAt = new Date();
      await tx
        .update(s.communicationThreads)
        .set({ lastMessageAt: sentAt, updatedAt: sentAt })
        .where(eq(s.communicationThreads.id, thread.id));

      await tx.insert(s.domainEvents).values({
        eventType: EventTypes.CommunicationMessageSent,
        aggregateType: "communication_thread",
        aggregateId: thread.id,
        actorPersonId,
        payload: { threadId: thread.id, messageId: message.id },
      });

      await tx.insert(s.auditEvents).values({
        actorPersonId,
        action: "communication.message_send",
        resourceType: "communication_thread",
        resourceId: thread.id,
        after: { sent: true, messageId: message.id },
        context: { requestId: context.requestId ?? null },
      });

      return { id: message.id, threadId: thread.id, sentAt: message.sentAt.toISOString() };
    });
  });
