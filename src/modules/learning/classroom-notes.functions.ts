import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { readClassContent } from "@/domain/class-content";
import { isLearnerFacingInstruction } from "@/domain/first-class-lesson";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { authorizeClass, classActor, type ClassTransaction } from "./class-access.server";
import { requireCurriculumDeliveryAccess } from "./curriculum-delivery-access.server";

const selection = z.object({
  sectionId: z.string().uuid(), versionId: z.string().uuid(),
  lessonId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
}).strict();

async function authorizeNote(data: z.infer<typeof selection>, tx?: ClassTransaction) {
  const actor = await classActor();
  if (actor.role !== "student" && actor.role !== "teacher") throw new AuthorizationError("own classroom notes");
  assertCapability(actor, actor.role === "student" ? "assignments:submit" : "teacher:read");
  const { section } = await authorizeClass(actor, data.sectionId, undefined, tx);
  if (section.contentStatus !== "published" || section.versionId !== data.versionId)
    throw new DomainError("CONFLICT", "The classroom release changed.");
  const { db } = await import("@/db/client");
  await requireCurriculumDeliveryAccess(tx ?? db, section);
  const lesson = readClassContent(section.curriculum)?.modules.flatMap(module => module.lessons)
    .find(item => item.id === data.lessonId);
  if (!lesson || !isLearnerFacingInstruction(lesson)) throw new DomainError("UNAVAILABLE", "Published instructional lesson unavailable.");
  return { actor, section };
}

export const getPrivateLessonNote = createServerFn({ method: "GET" })
  .validator((value: unknown) => selection.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor } = await authorizeNote(data);
    const [{ db }, { privateLessonNotes: notes }] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [note] = await db.select({ body: notes.body, revision: notes.revision, updatedAt: notes.updatedAt })
      .from(notes).where(and(eq(notes.authorPersonId, actor.actorPersonId), eq(notes.sectionId, data.sectionId),
        eq(notes.courseTemplateVersionId, data.versionId), eq(notes.lessonId, data.lessonId))).limit(1);
    return { body: note?.body ?? "", revision: note?.revision ?? 0, updatedAt: note?.updatedAt.toISOString() ?? null };
  });

export const savePrivateLessonNote = createServerFn({ method: "POST" })
  .validator((value: unknown) => selection.extend({ body: z.string().max(30_000), revision: z.number().int().min(0) }).strict().parse(value))
  .handler(async ({ data }) => {
    const [{ db }, { privateLessonNotes: notes }] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { actor, section } = await authorizeNote(selection.parse({
        sectionId: data.sectionId, versionId: data.versionId, lessonId: data.lessonId,
      }), tx);
      // Serialize first writes as well as updates; no note text enters audit or the outbox.
      const lock = `private-note:${actor.actorPersonId}:${section.id}:${section.versionId}:${data.lessonId}`;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lock}, 0))`);
      const predicate = and(eq(notes.authorPersonId, actor.actorPersonId), eq(notes.sectionId, section.id),
        eq(notes.courseTemplateVersionId, section.versionId), eq(notes.lessonId, data.lessonId));
      const [existing] = await tx.select().from(notes).where(predicate).for("update").limit(1);
      if (existing?.body === data.body) return { revision: existing.revision };
      if ((existing?.revision ?? 0) !== data.revision) throw new DomainError("CONFLICT", "Another session changed this private note.");
      const revision = data.revision + 1;
      const [saved] = existing
        ? await tx.update(notes).set({ body: data.body, revision, updatedAt: new Date() }).where(predicate).returning({ id: notes.id })
        : await tx.insert(notes).values({ sectionId: section.id, courseTemplateVersionId: section.versionId,
          authorPersonId: actor.actorPersonId, lessonId: data.lessonId, body: data.body, revision }).returning({ id: notes.id });
      if (!saved) throw new Error("Private lesson note did not persist.");
      await writeAudit(tx, actor, { action: "classroom.private_note.save", entityType: "private_lesson_note", entityId: saved.id,
        scope: { sectionId: section.id, programId: section.programId }, after: { revision, lessonId: data.lessonId } });
      await emitEvent(tx, { eventType: EventTypes.PrivateLessonNoteSaved, aggregateType: "private_lesson_note",
        aggregateId: saved.id, actorPersonId: actor.actorPersonId, programId: section.programId, siteId: section.siteId,
        payload: { lessonId: data.lessonId, versionId: section.versionId, revision } });
      return { revision };
    });
  });
