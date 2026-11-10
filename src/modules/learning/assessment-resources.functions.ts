import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { authorizeClass } from "./class-access.server";
import { requireActor, type Actor } from "@/modules/identity/actors.server";
import { writeAudit } from "@/platform/mutation";
import { createPrivateUpload, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { MAX_ATTACHMENT_BYTES, validateAttachmentUpload } from "./attachment-mimes";

/**
 * Teacher-attached assignment resources (worksheets, guides, exemplars) on the
 * existing R2 + documents infrastructure. Teachers of the Section manage them;
 * actively enrolled students read them. They are course material, never student
 * records, so they carry the standard sensitivity tier.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const resourceKeyPattern = /^learning\/resource\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const RESOURCE_CATEGORY = "assignment_resource";
const MAX_RESOURCES_PER_ASSESSMENT = 10;

function newResourceKey(assessmentId: string): string {
  if (!uuidPattern.test(assessmentId)) throw new Error("Invalid resource scope");
  return `learning/resource/${assessmentId}/${randomUUID()}`;
}

function signResourceObject(method: "PUT" | "GET", key: string, contentType?: string, expires = 180): string {
  return signPrivateObjectUrl({ method, key, keyPattern: resourceKeyPattern, contentType, expiresSeconds: expires });
}

type DbSchema = typeof import("@/db/schema");
type Db = typeof import("@/db/client").db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The exact-Section teaching relationship that owns this assessment. */
async function requireTeacherAssessment(dbOrTx: Db | Tx, s: DbSchema, assessmentId: string) {
  const context = await requireActor(["teacher"]);
  assertCapability(context, "assignments:create");
  if (!context.scope.siteIds?.length && !context.scope.sectionIds?.length)
    throw new AuthorizationError("named teacher Section or Site scope");
  const [assessment] = await dbOrTx.select({ id: s.assessments.id, sectionId: s.assessments.sectionId })
    .from(s.assessments).where(eq(s.assessments.id, assessmentId)).limit(1);
  if (!assessment) throw new AuthorizationError("teacher assessment");
  await authorizeClass(context as Actor, assessment.sectionId);
  const [teaching] = await dbOrTx.select({ id: s.sectionTeachers.id }).from(s.sectionTeachers)
    .where(and(eq(s.sectionTeachers.sectionId, assessment.sectionId),
      eq(s.sectionTeachers.personId, context.actorPersonId!))).limit(1);
  if (!teaching) throw new AuthorizationError("teaching assignment for this Section");
  return { context, assessment };
}

/** An actively enrolled student or the Section teacher may read resources. */
async function requireResourceReader(db: Db, s: DbSchema, assessmentId: string) {
  const context = await requireActor(["student", "teacher"]);
  const [assessment] = await db.select({ id: s.assessments.id, sectionId: s.assessments.sectionId })
    .from(s.assessments).innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
    .where(and(eq(s.assessments.id, assessmentId),
      inArray(s.assessments.status, ["published", "closed"]),
      inArray(s.sections.siteId, context.scope.siteIds ?? []))).limit(1);
  if (!assessment) throw new AuthorizationError("published assessment in authorized school");
  if (context.role === "teacher") {
    const [teaching] = await db.select({ id: s.sectionTeachers.id }).from(s.sectionTeachers)
      .where(and(eq(s.sectionTeachers.sectionId, assessment.sectionId),
        eq(s.sectionTeachers.personId, context.actorPersonId!))).limit(1);
    if (!teaching) throw new AuthorizationError("teaching assignment for this Section");
  } else {
    await authorizeClass(context as Actor, assessment.sectionId);
  }
  return { context, assessment };
}

/** Create the documents row and return a presigned PUT URL for one resource. */
export const createAssessmentResourceUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().uuid(),
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.number(),
  }).parse(value))
  .handler(async ({ data }) => {
    validateAttachmentUpload(data.fileName, data.contentType, data.sizeBytes);
    const key = newResourceKey(data.assessmentId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      const { context, assessment } = await requireTeacherAssessment(tx, s, data.assessmentId);
      const existing = await tx.select({ id: s.documents.id }).from(s.documents)
        .where(verifiedPrivateDocumentPredicate({
          subjectType: "assessment", subjectId: assessment.id, category: RESOURCE_CATEGORY,
        }));
      if (existing.length >= MAX_RESOURCES_PER_ASSESSMENT)
        throw new Error(`An assignment may carry at most ${MAX_RESOURCES_PER_ASSESSMENT} resources`);
      const [document] = await tx.insert(s.documents).values({
        subjectType: "assessment",
        subjectId: assessment.id,
        category: RESOURCE_CATEGORY,
        fileName: data.fileName,
        storageProvider: "cloudflare_r2",
        storageKey: key,
        mimeType: data.contentType,
        sensitivityTier: "standard",
        uploadedByPersonId: context.actorPersonId!,
        metadata: { assessmentId: assessment.id, sizeBytes: data.sizeBytes, uploadState: "pending" },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }).returning({ id: s.documents.id });
      if (!document) throw new Error("Could not record resource");
      await writeAudit(tx, {
        actorPersonId: context.actorPersonId,
        action: "assignment.resource.upload",
        resourceType: "document",
        resourceId: document.id,
        after: { assessmentId: assessment.id, storageProvider: "cloudflare_r2" },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { documentId: document.id, ...createPrivateUpload({ key, keyPattern: resourceKeyPattern, contentType: data.contentType, expiresSeconds: 180 }) };
    });
  });

/** Verify the uploaded object and publish the resource to the class (idempotent). */
export const finalizeAssessmentResource = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().uuid(),
    documentId: z.string().uuid(),
  }).parse(value))
  .handler(async ({ data }) => {
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      const { context, assessment } = await requireTeacherAssessment(tx, s, data.assessmentId);
      const [document] = await tx.select({
        id: s.documents.id, storageKey: s.documents.storageKey, mimeType: s.documents.mimeType,
        metadata: s.documents.metadata, verifiedAt: s.documents.verifiedAt, expiresAt: s.documents.expiresAt,
      }).from(s.documents).where(and(
        eq(s.documents.id, data.documentId),
        eq(s.documents.subjectType, "assessment"),
        eq(s.documents.subjectId, assessment.id),
        eq(s.documents.category, RESOURCE_CATEGORY),
        eq(s.documents.uploadedByPersonId, context.actorPersonId!),
      )).limit(1);
      if (!document) throw new Error("Resource not found for this assignment");
      if (document.verifiedAt) return { documentId: document.id, published: true, alreadyPublished: true };
      if (!document.storageKey.startsWith(`learning/resource/${assessment.id}/`))
        throw new AuthorizationError("resource assignment object scope");
      if (document.expiresAt && document.expiresAt <= new Date())
        throw new Error("Resource upload authorization has expired");
      const sizeBytes = document.metadata.sizeBytes;
      if (!resourceKeyPattern.test(document.storageKey) || typeof document.mimeType !== "string" ||
        !Number.isSafeInteger(sizeBytes) || Number(sizeBytes) < 1 || Number(sizeBytes) > MAX_ATTACHMENT_BYTES)
        throw new Error("Invalid resource storage record");
      await verifyPrivateObject({
        key: document.storageKey, keyPattern: resourceKeyPattern,
        expectedSize: Number(sizeBytes), expectedContentType: document.mimeType,
        verifySignature: ["application/pdf", "image/jpeg", "image/png"].includes(document.mimeType)
          ? matchesEnrollmentDocumentSignature : undefined,
      });
      await tx.update(s.documents).set({
        verifiedAt: new Date(), verifiedByPersonId: context.actorPersonId!,
        expiresAt: null, metadata: { ...document.metadata, uploadState: "verified" },
      }).where(eq(s.documents.id, document.id));
      await writeAudit(tx, {
        actorPersonId: context.actorPersonId,
        action: "assignment.resource.publish",
        resourceType: "document",
        resourceId: document.id,
        after: { assessmentId: assessment.id },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { documentId: document.id, published: true, alreadyPublished: false };
    });
  });

/** Published resource names for an enrolled student or the Section teacher. */
export const listAssessmentResources = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ assessmentId: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    let assessment;
    try {
      ({ assessment } = await requireResourceReader(db, s, data.assessmentId));
    } catch (error) {
      if (error instanceof AuthorizationError) return { resources: [] };
      throw error;
    }
    const rows = await db.select({
      id: s.documents.id, fileName: s.documents.fileName,
      mimeType: s.documents.mimeType, storageKey: s.documents.storageKey,
    }).from(s.documents)
      .where(verifiedPrivateDocumentPredicate({
        subjectType: "assessment", subjectId: assessment.id, category: RESOURCE_CATEGORY,
      }))
      .orderBy(asc(s.documents.createdAt));
    return {
      resources: rows.filter(row => row.storageKey.startsWith(`learning/resource/${assessment.id}/`))
        .map(row => ({ documentId: row.id, fileName: row.fileName, mimeType: row.mimeType })),
    };
  });

/** Short-lived download URL for one published resource. */
export const getAssessmentResourceDownload = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().uuid(), documentId: z.string().uuid(),
  }).parse(value))
  .handler(async ({ data }) => {
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const { assessment } = await requireResourceReader(db, s, data.assessmentId);
    const [document] = await db.select({ storageKey: s.documents.storageKey })
      .from(s.documents).where(and(eq(s.documents.id, data.documentId),
        verifiedPrivateDocumentPredicate({
          subjectType: "assessment", subjectId: assessment.id, category: RESOURCE_CATEGORY,
        }))).limit(1);
    if (!document || !document.storageKey.startsWith(`learning/resource/${assessment.id}/`))
      throw new AuthorizationError("verified resource scope");
    return { downloadUrl: signResourceObject("GET", document.storageKey, undefined, 60), expiresInSeconds: 60 };
  });

/** Remove a resource from the class; the audit retains the document trail. */
export const removeAssessmentResource = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().uuid(), documentId: z.string().uuid(),
  }).parse(value))
  .handler(async ({ data }) => {
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      const { context, assessment } = await requireTeacherAssessment(tx, s, data.assessmentId);
      const [document] = await tx.select({ id: s.documents.id, fileName: s.documents.fileName, storageKey: s.documents.storageKey })
        .from(s.documents).where(and(
          eq(s.documents.id, data.documentId),
          eq(s.documents.subjectType, "assessment"),
          eq(s.documents.subjectId, assessment.id),
          eq(s.documents.category, RESOURCE_CATEGORY),
        )).limit(1);
      if (!document) return { removed: false };
      if (!document.storageKey.startsWith(`learning/resource/${assessment.id}/`))
        throw new AuthorizationError("resource assignment object scope");
      await tx.delete(s.documents).where(eq(s.documents.id, document.id));
      await writeAudit(tx, {
        actorPersonId: context.actorPersonId,
        action: "assignment.resource.remove",
        resourceType: "document",
        resourceId: document.id,
        before: { assessmentId: assessment.id, fileName: document.fileName },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { removed: true };
    });
  });
