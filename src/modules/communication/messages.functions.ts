import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { demoAllowedRoles } from "@/modules/_demo/demo-write-gate";

/**
 * Contextual messaging surface (GF1 step 12, Experience Flow N1).
 * Thread access is derived from verified communicationParticipants membership,
 * never from a browser-supplied actor claim. Reads require an authenticated
 * person; writes additionally require the communication.send capability.
 */

const MAX_BODY_LENGTH = 4000;
const SNIPPET_LENGTH = 120;
const MAX_SUBJECT_LENGTH = 120;

const threadIdSchema = z.string().uuid();

type ThreadContact = { personId: string; name: string; label: string };

type Db = typeof import("@/db/client").db;
type Schema = typeof import("@/db/schema");

async function fetchDisplayNames(
  db: Db,
  s: Schema,
  personIds: string[],
): Promise<Map<string, string>> {
  if (!personIds.length) return new Map();
  const rows = await db
    .select({
      id: s.people.id,
      preferredName: s.people.preferredName,
      legalFirstName: s.people.legalFirstName,
      legalLastName: s.people.legalLastName,
    })
    .from(s.people)
    .where(inArray(s.people.id, personIds));
  return new Map(
    rows.map((row) => [
      row.id,
      `${row.preferredName ?? row.legalFirstName} ${row.legalLastName}`.trim(),
    ]),
  );
}

/**
 * Relationship-derived contacts the actor may start a thread with.
 * Never a directory: every entry traces to a verified guardian/student/
 * teacher/enrollment relationship. Unknown roles fail closed to no contacts.
 */
async function listAllowedThreadContacts(
  db: Db,
  s: Schema,
  role: string,
  actorPersonId: string,
  siteIds: string[],
  programIds: string[],
): Promise<ThreadContact[]> {
  const relationships = new Map<string, Set<string>>();
  const add = (personId: string, relationship: string) => {
    if (personId === actorPersonId) return;
    const parts = relationships.get(personId) ?? new Set<string>();
    parts.add(relationship);
    relationships.set(personId, parts);
  };

  if (role === "guardian") {
    const studentRows = await db
      .select({ studentPersonId: s.guardianRelationships.studentPersonId })
      .from(s.guardianRelationships)
      .innerJoin(s.studentProfiles,
        eq(s.studentProfiles.personId,s.guardianRelationships.studentPersonId))
      .innerJoin(s.enrollments,eq(s.enrollments.studentProfileId,s.studentProfiles.id))
      .innerJoin(s.programs,eq(s.programs.id,s.enrollments.programId))
      .where(and(
        eq(s.guardianRelationships.guardianPersonId,actorPersonId),
        eq(s.guardianRelationships.canViewAcademics,true),
        eq(s.enrollments.status,"active"),
        inArray(s.programs.siteId,siteIds),
        inArray(s.programs.id,programIds),
      ));
    const studentIds = [...new Set(studentRows.map(row=>row.studentPersonId))];
    if (studentIds.length) {
      const teacherRows = await db
        .select({
          personId: s.sectionTeachers.personId,
          sectionTitle: s.sections.title,
        })
        .from(s.enrollments)
        .innerJoin(
          s.studentProfiles,
          eq(s.studentProfiles.id, s.enrollments.studentProfileId),
        )
        .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
        .innerJoin(
          s.sectionTeachers,
          eq(s.sectionTeachers.sectionId, s.sections.id),
        )
        .where(
          and(
            inArray(s.studentProfiles.personId, studentIds),
            eq(s.enrollments.status, "active"),
            inArray(s.sections.siteId,siteIds),
            inArray(s.sections.programId,programIds),
          ),
        );
      for (const row of teacherRows) add(row.personId, `${row.sectionTitle} teacher`);

      const coGuardianRows = await db
        .select({
          guardianPersonId: s.guardianRelationships.guardianPersonId,
          studentPersonId: s.guardianRelationships.studentPersonId,
        })
        .from(s.guardianRelationships)
        .where(inArray(s.guardianRelationships.studentPersonId, studentIds));
      const studentNames = await fetchDisplayNames(db, s, studentIds);
      for (const row of coGuardianRows) {
        add(
          row.guardianPersonId,
          `co-guardian of ${studentNames.get(row.studentPersonId) ?? "your student"}`,
        );
      }
    }
  } else if (role === "teacher") {
    const sectionRows = await db
      .select({ id: s.sections.id, title: s.sections.title })
      .from(s.sectionTeachers)
      .innerJoin(s.sections, eq(s.sections.id, s.sectionTeachers.sectionId))
      .where(and(eq(s.sectionTeachers.personId, actorPersonId),
        inArray(s.sections.siteId,siteIds),inArray(s.sections.programId,programIds)));
    const sectionIds = sectionRows.map((row) => row.id);
    if (sectionIds.length) {
      const titleBySection = new Map(sectionRows.map((row) => [row.id, row.title]));
      const studentRows = await db
        .select({
          personId: s.studentProfiles.personId,
          sectionId: s.enrollments.sectionId,
        })
        .from(s.enrollments)
        .innerJoin(
          s.studentProfiles,
          eq(s.studentProfiles.id, s.enrollments.studentProfileId),
        )
        .where(
          and(
            inArray(s.enrollments.sectionId, sectionIds),
            eq(s.enrollments.status, "active"),
          ),
        );
      const studentIds = [...new Set(studentRows.map((row) => row.personId))];
      for (const row of studentRows) {
        add(
          row.personId,
          `student in ${titleBySection.get(row.sectionId ?? "") ?? "your class"}`,
        );
      }
      if (studentIds.length) {
        const guardianRows = await db
          .select({
            guardianPersonId: s.guardianRelationships.guardianPersonId,
            studentPersonId: s.guardianRelationships.studentPersonId,
          })
          .from(s.guardianRelationships)
          .where(
            and(
              inArray(s.guardianRelationships.studentPersonId, studentIds),
              eq(s.guardianRelationships.canViewAcademics, true),
            ),
          );
        const studentNames = await fetchDisplayNames(db, s, studentIds);
        for (const row of guardianRows) {
          add(
            row.guardianPersonId,
            `guardian of ${studentNames.get(row.studentPersonId) ?? "your student"}`,
          );
        }
      }
    }
  } else if (role === "student") {
    const teacherRows = await db
      .select({
        personId: s.sectionTeachers.personId,
        sectionTitle: s.sections.title,
      })
      .from(s.enrollments)
      .innerJoin(
        s.studentProfiles,
        and(
          eq(s.studentProfiles.id, s.enrollments.studentProfileId),
          eq(s.studentProfiles.personId, actorPersonId),
        ),
      )
      .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
      .innerJoin(
        s.sectionTeachers,
        eq(s.sectionTeachers.sectionId, s.sections.id),
      )
      .where(and(eq(s.enrollments.status,"active"),
        inArray(s.sections.siteId,siteIds),inArray(s.sections.programId,programIds)));
    for (const row of teacherRows) add(row.personId, `${row.sectionTitle} teacher`);

    const guardianRows = await db
      .select({ guardianPersonId: s.guardianRelationships.guardianPersonId })
      .from(s.guardianRelationships)
      .where(eq(s.guardianRelationships.studentPersonId, actorPersonId));
    for (const row of guardianRows) add(row.guardianPersonId, "guardian");
  }
  // registrar/specialist: no relationship-derived contacts yet

  if (!relationships.size) return [];
  const names = await fetchDisplayNames(db, s, [...relationships.keys()]);
  return [...relationships.entries()]
    .map(([personId, parts]) => {
      const name = names.get(personId);
      if (!name) return null;
      return { personId, name, label: `${name} — ${[...parts].sort().join("; ")}` };
    })
    .filter((contact): contact is ThreadContact => contact !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const listThreadContacts = createServerFn({ method: "GET" }).handler(async () => {
  const context = await getCommandContext(getRequest());
  setResponseHeader("Cache-Control", "private, no-store");
  const actorPersonId = requireActorPerson(context.actorPersonId);
  const role = context.role;
  if (!role || !(demoAllowedRoles as readonly string[]).includes(role)) {
    return { contacts: [] as ThreadContact[] };
  }
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const contacts = await listAllowedThreadContacts(db, s, role, actorPersonId, context.scope.siteIds??[], context.scope.programIds??[]);
  return { contacts };
});

export const startThread = createServerFn({ method: "POST" })
  .validator((value: unknown) =>
    z
      .object({
        recipientPersonId: z.string().uuid(),
        subject: z
          .string()
          .trim()
          .min(3, "Subject must be at least 3 characters")
          .max(MAX_SUBJECT_LENGTH, `Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer`),
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
      throw new AuthorizationError("authorized messaging role");
    }
    const actorPersonId = requireActorPerson(context.actorPersonId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);

    // Re-derive the allowed contact set server-side; fail closed if the
    // requested recipient is not reachable through a real relationship.
    const contacts = await listAllowedThreadContacts(db, s, role, actorPersonId, context.scope.siteIds??[], context.scope.programIds??[]);
    if (!contacts.some((contact) => contact.personId === data.recipientPersonId)) {
      throw new AuthorizationError("communication thread recipient");
    }

    return db.transaction(async (tx) => {
      const sentAt = new Date();
      const [thread] = await tx
        .insert(s.communicationThreads)
        .values({
          subject: data.subject,
          contextType: null,
          createdByPersonId: actorPersonId,
          lastMessageAt: sentAt,
        })
        .returning({ id: s.communicationThreads.id });
      if (!thread) throw new Error("Failed to create communication thread");

      await tx.insert(s.communicationParticipants).values([
        { threadId: thread.id, participantType: "person" as const, participantId: actorPersonId },
        { threadId: thread.id, participantType: "person" as const, participantId: data.recipientPersonId },
      ]);

      const [message] = await tx
        .insert(s.communicationMessages)
        .values({
          threadId: thread.id,
          senderPersonId: actorPersonId,
          body: data.body,
        })
        .returning({ id: s.communicationMessages.id });
      if (!message) throw new Error("Failed to send message");

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
        after: { sent: true, messageId: message.id, threadStarted: true },
        context: { requestId: context.requestId ?? null },
      });

      return { threadId: thread.id };
    });
  });

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
      throw new AuthorizationError("authorized messaging role");
    }
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
