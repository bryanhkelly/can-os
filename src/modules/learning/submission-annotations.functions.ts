import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { validateAnnotationRange } from "@/domain/class-content";
import { EventTypes } from "@/domain/event-types";
import { recordAudit } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { authorizeClass, classActor, type ClassTransaction } from "./class-access.server";

async function annotationSubmission(submissionId: string, tx?: ClassTransaction) {
  const actor = await classActor();
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const query = tx ?? db;
  const rows = query.select({ id: s.submissions.id, assessmentId: s.submissions.assessmentId, status: s.submissions.status,
    response: s.submissions.response, sectionId: s.assessments.sectionId, personId: s.studentProfiles.personId })
    .from(s.submissions).innerJoin(s.assessments, eq(s.assessments.id, s.submissions.assessmentId))
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.submissions.studentProfileId))
    .where(and(eq(s.submissions.id, submissionId), inArray(s.assessments.status, ["published", "closed"]))).limit(1);
  const [submission] = tx ? await rows.for("update", { of: s.submissions }) : await rows;
  if (!submission) throw new AuthorizationError("assessment submission");
  const access = await authorizeClass(actor, submission.sectionId, submission.personId, tx);
  if (actor.role === "student" && access.studentPersonId !== submission.personId) throw new AuthorizationError("own submission");
  return { actor, submission, section: access.section };
}

export const getSubmissionAnnotations = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ submissionId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, submission } = await annotationSubmission(data.submissionId);
    if (actor.role !== "teacher" && !["graded", "returned"].includes(submission.status)) return { annotations: [] };
    if (!["submitted", "graded", "returned"].includes(submission.status)) throw new AuthorizationError("submitted response");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const rows = await db.select({ id: s.submissionAnnotations.id, quote: s.submissionAnnotations.quote,
      comment: s.submissionAnnotations.comment, startOffset: s.submissionAnnotations.startOffset,
      endOffset: s.submissionAnnotations.endOffset, createdAt: s.submissionAnnotations.createdAt,
      author: s.people.legalFirstName, lastName: s.people.legalLastName, preferredName: s.people.preferredName })
      .from(s.submissionAnnotations).innerJoin(s.people, eq(s.people.id, s.submissionAnnotations.authorPersonId))
      .where(eq(s.submissionAnnotations.submissionId, submission.id)).orderBy(s.submissionAnnotations.createdAt);
    return { annotations: rows.map(row => ({
      id: row.id, quote: row.quote, comment: row.comment, startOffset: row.startOffset, endOffset: row.endOffset,
      createdAt: row.createdAt.toISOString(), author: `${row.preferredName ?? row.author} ${row.lastName}`,
    })) };
  });

export const addSubmissionAnnotation = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    id: z.string().uuid(), submissionId: z.string().uuid(),
    startOffset: z.number().int().min(0), endOffset: z.number().int().positive(),
    quote: z.string().min(1).max(4000), comment: z.string().trim().min(1).max(4000),
  }).parse(value))
  .handler(async ({ data }) => {
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      const { actor, submission, section } = await annotationSubmission(data.submissionId, tx);
      if (actor.role !== "teacher") throw new AuthorizationError("teacher annotation");
      assertCapability(actor, "assignments:grade");
      if (!["submitted", "graded", "returned"].includes(submission.status)) throw new Error("Only submitted work can be annotated.");
      const text = typeof submission.response.text === "string" ? submission.response.text : "";
      validateAnnotationRange(text, data.startOffset, data.endOffset, data.quote);
      const [prior] = await tx.select().from(s.submissionAnnotations).where(eq(s.submissionAnnotations.id, data.id)).limit(1);
      if (prior) {
        if (prior.submissionId !== submission.id || prior.authorPersonId !== actor.actorPersonId ||
          prior.startOffset !== data.startOffset || prior.endOffset !== data.endOffset || prior.quote !== data.quote || prior.comment !== data.comment) {
          throw new Error("This annotation request was already used with different content.");
        }
        return { id: prior.id };
      }
      await tx.insert(s.submissionAnnotations).values({
        id: data.id, submissionId: submission.id, authorPersonId: actor.actorPersonId,
        startOffset: data.startOffset, endOffset: data.endOffset, quote: data.quote, comment: data.comment,
      });
      await recordAudit(tx, actor, { action: "learning.submission_annotate", resourceType: "submission_annotation", resourceId: data.id,
        after: { submissionId: submission.id, startOffset: data.startOffset, endOffset: data.endOffset },
        scope: { sectionId: section.id, programId: section.programId, siteId: section.siteId } });
      await emitEvent(tx, { eventType: EventTypes.SubmissionAnnotated, aggregateType: "submission", aggregateId: submission.id,
        actorPersonId: actor.actorPersonId, payload: { annotationId: data.id, assessmentId: submission.assessmentId, released: submission.status !== "submitted" } });
      return { id: data.id };
    });
  });
