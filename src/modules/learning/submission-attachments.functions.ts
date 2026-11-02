import { assertAssessmentAttemptAllowed } from "@/domain/assessment-attempt-policy";
import { assertAssessmentActionable } from "@/domain/assessment-availability";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { authorizeClass } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { writeAudit } from "@/platform/mutation";
import { signPrivateObjectUrl,verifyPrivateObject } from "@/platform/storage/r2";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  MAX_ATTACHMENT_BYTES,
  validateAttachmentUpload,
} from "./attachment-mimes";

/**
 * Assignment-submission and attendance-excuse attachments on the existing R2 +
 * documents infrastructure. Domain authorization and key policy stay here;
 * signing and bounded object verification are shared storage infrastructure.
 * The extension/MIME allowlist lives in attachment-mimes so the client file
 * pickers and this server validation cannot drift apart.
 */

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const learningKeyPattern = /^learning\/(assignment|excuse)\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;

function newAttachmentKey(kind: "assignment" | "excuse", scopeId: string): string {
  if (!uuidPattern.test(scopeId)) throw new Error("Invalid attachment scope");
  return `learning/${kind}/${scopeId}/${randomUUID()}`;
}

function signLearningObject(method: "PUT" | "HEAD" | "GET", key: string, contentType?: string, expires = 180): string {
  return signPrivateObjectUrl({ method, key, keyPattern: learningKeyPattern, contentType, expiresSeconds: expires });
}

/** Confirm that the private object was actually uploaded before linking it to a student record. */
async function assertUploadedLearningObject(
 key:string,contentType:string|null,expectedSize:unknown,
):Promise<void>{
 if(!learningKeyPattern.test(key)||typeof contentType!=="string"||
  !Number.isSafeInteger(expectedSize)||Number(expectedSize)<1||
  Number(expectedSize)>MAX_ATTACHMENT_BYTES)
  throw new Error("Invalid attachment storage record");
 await verifyPrivateObject({
  key,keyPattern:learningKeyPattern,expectedSize:Number(expectedSize),
  expectedContentType:contentType,
  verifySignature:["application/pdf","image/jpeg","image/png"].includes(contentType)
   ? matchesEnrollmentDocumentSignature:undefined,
 });
}

/** Verified student actor; identity always comes from the server session. */
async function studentActor() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "assignments:submit");
  if (context.role !== "student" || !context.actorPersonId) throw new AuthorizationError("student assignment access");
  if (!context.scope.siteIds?.length) throw new AuthorizationError("student site membership");
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [profile] = await db.select({ id: s.studentProfiles.id }).from(s.studentProfiles)
    .where(eq(s.studentProfiles.personId, context.actorPersonId)).limit(1);
  if (!profile) throw new AuthorizationError("student profile");
  return { context, studentId: profile.id, studentPersonId: context.actorPersonId };
}

/** Verified guardian actor with the excuse-submission capability. */
async function guardianActor() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "attendance.excuse.submit");
  if (context.role !== "guardian" || !context.actorPersonId || !context.scope.siteIds?.length) {
    throw new AuthorizationError("guardian attendance access");
  }
  return context;
}

type DbSchema = typeof import("@/db/schema");
type Tx = Parameters<Parameters<typeof import("@/db/client").db.transaction>[0]>[0];

/** Published synthetic assessment at a scoped site where the student is actively enrolled. */
async function requireEnrolledAssessment(
  tx: Tx, s: DbSchema, assessmentId: string, studentId: string, actor: Actor,
  allowClosedForRead=false,
) {
  const [assessment] = await tx.select({ id: s.assessments.id, sectionId: s.assessments.sectionId, status: s.assessments.status, availableAt: s.assessments.availableAt, closesAt: s.assessments.closesAt, metadata: s.assessments.metadata })
    .from(s.assessments).innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
    .where(and(eq(s.assessments.id, assessmentId),
      allowClosedForRead?inArray(s.assessments.status,["published","closed"])
        :eq(s.assessments.status,"published"),
      inArray(s.sections.siteId,actor.scope.siteIds??[]),
      inArray(s.sections.programId,actor.scope.programIds??[]))).limit(1);
  if (!assessment) throw new AuthorizationError("published assessment in authorized school and program");
  // Preserve the same active Program, Section and school year boundary for
  // all learning files, including short-lived download URL issuance.
  const enrollment=await authorizeClass(actor,assessment.sectionId,undefined,tx);
  if(enrollment.studentProfileId!==studentId)throw new AuthorizationError("current student learning scope");
  if (!allowClosedForRead) assertAssessmentActionable(assessment);
  return assessment;
}

/** Absence event the guardian may see via a verified canViewAcademics relationship. */
async function requireGuardianEvent(tx: Tx, s: DbSchema, attendanceEventId: string, guardianPersonId: string, programIds: string[]) {
  const [record] = await tx.select({
    eventId: s.attendanceEvents.id,
    studentPersonId: s.studentProfiles.personId,
  }).from(s.attendanceEvents)
    .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.attendanceEvents.studentProfileId))
    .where(and(eq(s.attendanceEvents.id, attendanceEventId), inArray(s.attendanceEvents.programId, programIds))).limit(1);
  if (!record) throw new Error("AttendanceEvent not found");
  const [relationship] = await tx.select({ id: s.guardianRelationships.id }).from(s.guardianRelationships)
    .where(guardianRelationshipPredicate({
      guardianPersonId,
      studentPersonId: record.studentPersonId,
      access: "academic",
    })).limit(1);
  if (!relationship) throw new AuthorizationError("guardian attendance relationship");
  return record;
}

/** Create the documents row and return a presigned PUT URL for one assignment attachment. */
export const createSubmissionAttachmentUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().min(1),
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.number(),
  }).parse(value))
  .handler(async ({ data }) => {
    const { context, studentId, studentPersonId } = await studentActor();
    validateAttachmentUpload(data.fileName, data.contentType, data.sizeBytes);
    const key = newAttachmentKey("assignment", data.assessmentId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      const assessment = await requireEnrolledAssessment(tx, s, data.assessmentId, studentId, context as Actor);
      const [document] = await tx.insert(s.documents).values({
        subjectType: "assessment",
        subjectId: assessment.id,
        category: "assignment_submission",
        fileName: data.fileName,
        storageProvider: "cloudflare_r2",
        storageKey: key,
        mimeType: data.contentType,
        sensitivityTier: "restricted",
        uploadedByPersonId: studentPersonId,
        metadata: { assessmentId: assessment.id, sizeBytes: data.sizeBytes, uploadState: "pending" },
        expiresAt: new Date(Date.now()+24*60*60*1000),
      }).returning({ id: s.documents.id });
      if (!document) throw new Error("Could not record attachment");
      await writeAudit(tx, {
        actorPersonId: studentPersonId,
        action: "assignment.attachment.upload",
        resourceType: "document",
        resourceId: document.id,
        after: { assessmentId: assessment.id, storageProvider: "cloudflare_r2" },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { documentId: document.id, key, uploadUrl: signLearningObject("PUT", key, data.contentType, 180), expiresInSeconds: 180 };
    });
  });

/** Merge an uploaded document into the current attempt's response.attachments (idempotent). */
export const attachDocumentToSubmission = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    assessmentId: z.string().min(1),
    documentId: z.string().min(1),
  }).parse(value))
  .handler(async ({ data }) => {
    const { context, studentId, studentPersonId } = await studentActor();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      const assessment = await requireEnrolledAssessment(tx, s, data.assessmentId, studentId, context as Actor);
      // Serialize with draft/submit writes for this student+assessment.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${assessment.id}))`);
      const [document] = await tx.select({ id: s.documents.id,storageKey:s.documents.storageKey,mimeType:s.documents.mimeType,metadata:s.documents.metadata,verifiedAt:s.documents.verifiedAt,expiresAt:s.documents.expiresAt }).from(s.documents).where(and(
        eq(s.documents.id, data.documentId),
        eq(s.documents.subjectType, "assessment"),
        eq(s.documents.subjectId, assessment.id),
        eq(s.documents.category, "assignment_submission"),
        eq(s.documents.uploadedByPersonId, studentPersonId),
      )).limit(1);
      if (!document) throw new Error("Attachment not found for this assignment");
      if(!document.storageKey.startsWith(`learning/assignment/${assessment.id}/`))
        throw new AuthorizationError("attachment assignment object scope");
      if(document.expiresAt&&document.expiresAt<=new Date())
        throw new Error("Attachment upload authorization has expired");
      await assertUploadedLearningObject(document.storageKey,document.mimeType,document.metadata.sizeBytes);
      if(!document.verifiedAt)await tx.update(s.documents).set({
        verifiedAt:new Date(),verifiedByPersonId:context.actorPersonId!,
        expiresAt:null,metadata:{...document.metadata,uploadState:"verified"}
      }).where(eq(s.documents.id,document.id));
      const [latest] = await tx.select().from(s.submissions)
        .where(and(eq(s.submissions.assessmentId, assessment.id), eq(s.submissions.studentProfileId, studentId)))
        .orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
      if (!latest || latest.status === "assigned")
        assertAssessmentAttemptAllowed(assessment.metadata, latest?.attemptNumber ?? 1);
      const mergeAttachments = (response: Record<string, unknown>): { response: Record<string, unknown>; already: boolean } => {
        const existing = Array.isArray(response.attachments)
          ? (response.attachments as unknown[]).filter((item): item is string => typeof item === "string")
          : [];
        if (existing.includes(document.id)) return { response, already: true };
        return { response: { ...response, attachments: [...existing, document.id] }, already: false };
      };
      if (latest) {
        const merged = mergeAttachments(latest.response);
        // A retry for an already attached file is harmless; new evidence must
        // be attached while the attempt is still a draft.
        if (merged.already) return { submissionId: latest.id, attached: true, alreadyAttached: true };
        if (latest.status !== "assigned") {
          throw new Error("Submitted attempts cannot accept new attachments");
        }
        const [updated] = await tx.update(s.submissions)
          .set({ response: merged.response, updatedAt: new Date() })
          .where(and(eq(s.submissions.id, latest.id), eq(s.submissions.status, "assigned")))
          .returning({ id: s.submissions.id });
        if (!updated) throw new Error("Assignment changed in another tab; refresh before attaching");
        await writeAudit(tx, {
          actorPersonId: studentPersonId,
          action: "assignment.attachment.attach",
          resourceType: "submission",
          resourceId: updated.id,
          after: { documentId: document.id, status: latest.status },
          context: { accountId: context.accountId, sessionId: context.sessionId },
        });
        return { submissionId: updated.id, attached: true, alreadyAttached: false };
      }
      const [created] = await tx.insert(s.submissions).values({
        assessmentId: assessment.id,
        studentProfileId: studentId,
        status: "assigned",
        response: { attachments: [document.id] },
      }).returning({ id: s.submissions.id });
      if (!created) throw new Error("Unable to attach document");
      await writeAudit(tx, {
        actorPersonId: studentPersonId,
        action: "assignment.attachment.attach",
        resourceType: "submission",
        resourceId: created.id,
        after: { documentId: document.id, status: "assigned" },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { submissionId: created.id, attached: true, alreadyAttached: false };
    });
  });

/** Verified file names on the student's exact attempt; defaults to latest. */
export const listSubmissionAttachments = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ assessmentId: z.string().min(1), attemptNumber: z.number().int().positive().optional() }).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { context, studentId, studentPersonId } = await studentActor();
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [assessment] = await db.select({ id: s.assessments.id, sectionId: s.assessments.sectionId })
      .from(s.assessments).innerJoin(s.sections, eq(s.sections.id, s.assessments.sectionId))
      .where(and(eq(s.assessments.id, data.assessmentId), inArray(s.sections.siteId, context.scope.siteIds!),inArray(s.sections.programId,context.scope.programIds??[]))).limit(1);
    if (!assessment) return { attachments: [] };
    try {
      const enrollment=await authorizeClass(context as Actor,assessment.sectionId);
      if(enrollment.studentProfileId!==studentId)return {attachments:[]};
    } catch(error) {
      if(error instanceof AuthorizationError)return {attachments:[]};
      throw error;
    }
    const [latest] = await db.select({ response: s.submissions.response }).from(s.submissions)
      .where(and(eq(s.submissions.assessmentId, assessment.id), eq(s.submissions.studentProfileId, studentId),
        data.attemptNumber === undefined ? undefined : eq(s.submissions.attemptNumber, data.attemptNumber)))
      .orderBy(desc(s.submissions.attemptNumber)).limit(1);
    const ids = latest && Array.isArray(latest.response.attachments)
      ? (latest.response.attachments as unknown[]).filter((item): item is string => typeof item === "string" && uuidPattern.test(item))
      : [];
    if (!ids.length) return { attachments: [] };
    const rows = await db.select({ id: s.documents.id, fileName: s.documents.fileName, storageKey: s.documents.storageKey }).from(s.documents)
      .where(and(inArray(s.documents.id, ids), verifiedPrivateDocumentPredicate({
        subjectType: "assessment", subjectId: assessment.id,
        category: "assignment_submission", uploadedByPersonId: studentPersonId,
      })))
      .orderBy(s.documents.createdAt);
    const byId = new Map(rows.filter(row => row.storageKey.startsWith(`learning/assignment/${assessment.id}/`))
      .map((row) => [row.id, row.fileName]));
    return { attachments: ids.filter((id) => byId.has(id)).map((id) => ({ documentId: id, fileName: byId.get(id)! })) };
  });

/** Create the documents row and presigned PUT URL for a guardian's excuse document. */
export const createExcuseAttachmentUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    attendanceEventId: z.string().min(1),
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.number(),
  }).parse(value))
  .handler(async ({ data }) => {
    const context = await guardianActor();
    if (!uuidPattern.test(data.attendanceEventId)) throw new Error("Invalid attendance event");
    validateAttachmentUpload(data.fileName, data.contentType, data.sizeBytes);
    const key = newAttachmentKey("excuse", data.attendanceEventId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      await requireGuardianEvent(tx, s, data.attendanceEventId, context.actorPersonId!, context.scope.programIds ?? []);
      const [document] = await tx.insert(s.documents).values({
        subjectType: "attendance_event",
        subjectId: data.attendanceEventId,
        category: "attendance_excuse",
        fileName: data.fileName,
        storageProvider: "cloudflare_r2",
        storageKey: key,
        mimeType: data.contentType,
        sensitivityTier: "restricted",
        uploadedByPersonId: context.actorPersonId!,
        metadata: { attendanceEventId: data.attendanceEventId, sizeBytes: data.sizeBytes, uploadState: "pending" },
        expiresAt: new Date(Date.now()+24*60*60*1000),
      }).returning({ id: s.documents.id });
      if (!document) throw new Error("Could not record attachment");
      await writeAudit(tx, {
        actorPersonId: context.actorPersonId,
        action: "attendance.excuse.document.upload",
        resourceType: "document",
        resourceId: document.id,
        after: { attendanceEventId: data.attendanceEventId, storageProvider: "cloudflare_r2" },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { documentId: document.id, key, uploadUrl: signLearningObject("PUT", key, data.contentType, 180), expiresInSeconds: 180 };
    });
  });

/** Merge a document into the event's excuse while it is still submitted (idempotent). */
export const attachDocumentToExcuse = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    attendanceEventId: z.string().min(1),
    documentId: z.string().min(1),
  }).parse(value))
  .handler(async ({ data }) => {
    const context = await guardianActor();
    if (!uuidPattern.test(data.attendanceEventId)) throw new Error("Invalid attendance event");
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async (tx) => {
      await requireGuardianEvent(tx, s, data.attendanceEventId, context.actorPersonId!, context.scope.programIds ?? []);
      const [document] = await tx.select({ id: s.documents.id,storageKey:s.documents.storageKey,mimeType:s.documents.mimeType,metadata:s.documents.metadata,verifiedAt:s.documents.verifiedAt,expiresAt:s.documents.expiresAt }).from(s.documents).where(and(
        eq(s.documents.id, data.documentId),
        eq(s.documents.subjectType, "attendance_event"),
        eq(s.documents.subjectId, data.attendanceEventId),
        eq(s.documents.category, "attendance_excuse"),
        eq(s.documents.uploadedByPersonId, context.actorPersonId!),
      )).limit(1);
      if (!document) throw new Error("Document not found for this attendance event");
      if(!document.storageKey.startsWith(`learning/excuse/${data.attendanceEventId}/`))
        throw new AuthorizationError("attachment attendance object scope");
      if(document.expiresAt&&document.expiresAt<=new Date())
        throw new Error("Attachment upload authorization has expired");
      await assertUploadedLearningObject(document.storageKey,document.mimeType,document.metadata.sizeBytes);
      if(!document.verifiedAt)await tx.update(s.documents).set({
        verifiedAt:new Date(),verifiedByPersonId:context.actorPersonId!,
        expiresAt:null,metadata:{...document.metadata,uploadState:"verified"}
      }).where(eq(s.documents.id,document.id));
      const [excuse] = await tx.select().from(s.attendanceExcuses)
        .where(eq(s.attendanceExcuses.attendanceEventId, data.attendanceEventId))
        .orderBy(desc(s.attendanceExcuses.createdAt)).limit(1).for("update");
      if (!excuse) throw new Error("Submit the excuse before attaching documents");
      if (excuse.status !== "submitted") throw new Error("This excuse has already been reviewed; documents can no longer be attached");
      if (excuse.documentIds.includes(document.id)) {
        return { excuseId: excuse.id, attached: true, alreadyAttached: true };
      }
      const [updated] = await tx.update(s.attendanceExcuses)
        .set({ documentIds: [...excuse.documentIds, document.id], updatedAt: new Date() })
        .where(and(eq(s.attendanceExcuses.id, excuse.id), eq(s.attendanceExcuses.status, "submitted")))
        .returning({ id: s.attendanceExcuses.id });
      if (!updated) throw new Error("Excuse changed in another tab; refresh before attaching");
      await writeAudit(tx, {
        actorPersonId: context.actorPersonId,
        action: "attendance.excuse.document.attach",
        resourceType: "attendance_excuse",
        resourceId: updated.id,
        after: { documentId: document.id, attendanceEventId: data.attendanceEventId },
        context: { accountId: context.accountId, sessionId: context.sessionId },
      });
      return { excuseId: updated.id, attached: true, alreadyAttached: false };
    });
  });

/** Document counts on the latest excuse per event, for absences the guardian may view. */
export const listExcuseAttachmentCounts = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ attendanceEventIds: z.array(z.string().min(1)).max(50) }).parse(value))
  .handler(async ({ data }) => {
    const context = await guardianActor();
    const eventIds = [...new Set(data.attendanceEventIds)].filter((id) => uuidPattern.test(id));
    if (!eventIds.length) return { counts: [] };
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const viewable = await db.select({ eventId: s.attendanceEvents.id }).from(s.attendanceEvents)
      .innerJoin(s.studentProfiles, eq(s.studentProfiles.id, s.attendanceEvents.studentProfileId))
      .innerJoin(s.guardianRelationships, guardianRelationshipPredicate({
        studentPersonId: s.studentProfiles.personId,
        guardianPersonId: context.actorPersonId!,
        access: "academic",
      }))
      .where(and(inArray(s.attendanceEvents.id, eventIds), inArray(s.attendanceEvents.programId, context.scope.programIds ?? [])));
    if (!viewable.length) return { counts: [] };
    const excuses = await db.select({
      attendanceEventId: s.attendanceExcuses.attendanceEventId,
      documentIds: s.attendanceExcuses.documentIds,
    }).from(s.attendanceExcuses)
      .where(inArray(s.attendanceExcuses.attendanceEventId, viewable.map((row) => row.eventId)))
      .orderBy(desc(s.attendanceExcuses.createdAt));
    const latest = new Map<string, number>();
    for (const excuse of excuses) {
      if (!latest.has(excuse.attendanceEventId)) latest.set(excuse.attendanceEventId, excuse.documentIds.length);
    }
    return { counts: [...latest.entries()].map(([attendanceEventId, count]) => ({ attendanceEventId, count })) };
  });

/** Short-lived private URL for a verified file on this student's exact attempt. */
export const getSubmissionAttachmentDownload=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
  assessmentId:z.string().uuid(),documentId:z.string().uuid(),
  attemptNumber:z.number().int().positive().optional()
 }).parse(value))
 .handler(async({data})=>{
  const {context,studentId,studentPersonId}=await studentActor();
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
  const assessment=await requireEnrolledAssessment(tx,s,data.assessmentId,studentId,
    context as Actor,true);
  const [latest]=await tx.select({response:s.submissions.response})
   .from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),
    eq(s.submissions.studentProfileId,studentId),
    data.attemptNumber === undefined ? undefined : eq(s.submissions.attemptNumber,data.attemptNumber)))
   .orderBy(desc(s.submissions.attemptNumber)).limit(1);
  const ids=Array.isArray(latest?.response.attachments)?latest.response.attachments:[];
  if(!ids.includes(data.documentId))throw new AuthorizationError("attachment belongs to selected student submission");
  const [document]=await tx.select({
   storageKey:s.documents.storageKey,verifiedAt:s.documents.verifiedAt,
   mimeType:s.documents.mimeType
  }).from(s.documents).where(and(eq(s.documents.id,data.documentId),
   verifiedPrivateDocumentPredicate({
    subjectType:"assessment",subjectId:assessment.id,category:"assignment_submission",
    uploadedByPersonId:studentPersonId,
   }))).limit(1);
  if(!document?.verifiedAt||!document.storageKey.startsWith(`learning/assignment/${assessment.id}/`))
    throw new AuthorizationError("verified attachment scope");
  return {downloadUrl:signLearningObject("GET",document.storageKey,undefined,60),expiresInSeconds:60};
  });
 });

/** Verified staff reviewer (teacher on the section, or registrar) for excuse documents. */
async function excuseReviewActor() {
  const context = await getCommandContext(getRequest());
  assertCapability(context, "attendance.excuse.review");
  if (!["teacher", "registrar"].includes(context.role) || !context.actorPersonId ||
    !context.scope.siteIds?.length || !context.scope.programIds?.length ||
    !context.scope.organizationIds?.length) {
    throw new AuthorizationError("attendance excuse review grant");
  }
  return context;
}

/**
 * The uploading guardian can fetch a verified file on a current child's
 * excuse; staff with attendance.excuse.review authority over the excuse's
 * site/program (teachers additionally need the section assignment) can fetch
 * it for review. Reviewer downloads are audited.
 */
export const getExcuseAttachmentDownload=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({
  attendanceEventId:z.string().uuid(),documentId:z.string().uuid()
 }).parse(value))
 .handler(async({data})=>{
  const session=await getCommandContext(getRequest());
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  if(session.role!=="guardian"){
  const context=await excuseReviewActor();
  return db.transaction(async tx=>{
  const [event]=await tx.select({
   siteId:s.attendanceEvents.siteId,programId:s.attendanceEvents.programId,
   sectionId:s.attendanceEvents.sectionId,
  }).from(s.attendanceEvents).where(eq(s.attendanceEvents.id,data.attendanceEventId)).limit(1);
  if(!event||!event.siteId||!context.scope.siteIds!.includes(event.siteId)||
    !context.scope.programIds!.includes(event.programId))
    throw new AuthorizationError("excuse review site and program scope");
  const [host]=await tx.select({organizationId:s.programs.organizationId}).from(s.programs)
    .where(eq(s.programs.id,event.programId)).limit(1);
  if(!host||!context.scope.organizationIds!.includes(host.organizationId))
    throw new AuthorizationError("excuse review organization scope");
  if(context.role==="teacher"){
   const [assignment]=event.sectionId?await tx.select({id:s.sectionTeachers.id}).from(s.sectionTeachers)
    .where(and(eq(s.sectionTeachers.sectionId,event.sectionId),
     eq(s.sectionTeachers.personId,context.actorPersonId!))).limit(1):[];
   if(!assignment)throw new AuthorizationError("teacher excuse section assignment");
  }
  const excuses=await tx.select({documentIds:s.attendanceExcuses.documentIds})
    .from(s.attendanceExcuses)
    .where(eq(s.attendanceExcuses.attendanceEventId,data.attendanceEventId));
  if(!excuses.some(excuse=>excuse.documentIds.includes(data.documentId)))
    throw new AuthorizationError("document not attached to an excuse for this attendance record");
  const [document]=await tx.select({
   storageKey:s.documents.storageKey,verifiedAt:s.documents.verifiedAt
  }).from(s.documents).where(and(eq(s.documents.id,data.documentId),
    verifiedPrivateDocumentPredicate({
     subjectType:"attendance_event",subjectId:data.attendanceEventId,category:"attendance_excuse",
    }))).limit(1);
  if(!document?.verifiedAt||!document.storageKey.startsWith(`learning/excuse/${data.attendanceEventId}/`))
    throw new AuthorizationError("verified excuse document scope");
  await writeAudit(tx, {
    actorPersonId: context.actorPersonId,
    action: "attendance.excuse.document.review_download",
    resourceType: "document",
    resourceId: data.documentId,
    scope: { siteId: event.siteId, programId: event.programId },
    after: { attendanceEventId: data.attendanceEventId },
    context: { accountId: context.accountId, sessionId: context.sessionId },
  });
  return {downloadUrl:signLearningObject("GET",document.storageKey,undefined,60),expiresInSeconds:60};
  });
  }
  const context=await guardianActor();
  return db.transaction(async tx=>{
  await requireGuardianEvent(tx,s,data.attendanceEventId,context.actorPersonId!,
    context.scope.programIds??[]);
  const [excuse]=await tx.select({documentIds:s.attendanceExcuses.documentIds})
    .from(s.attendanceExcuses)
    .where(eq(s.attendanceExcuses.attendanceEventId,data.attendanceEventId))
    .orderBy(desc(s.attendanceExcuses.createdAt)).limit(1);
  if(!excuse?.documentIds.includes(data.documentId))
    throw new AuthorizationError("document not attached to latest excuse");
  const [document]=await tx.select({
   storageKey:s.documents.storageKey,verifiedAt:s.documents.verifiedAt
  }).from(s.documents).where(and(eq(s.documents.id,data.documentId),
    verifiedPrivateDocumentPredicate({
     subjectType:"attendance_event",subjectId:data.attendanceEventId,category:"attendance_excuse",
     uploadedByPersonId:context.actorPersonId!,
    }))).limit(1);
  if(!document?.verifiedAt||!document.storageKey.startsWith(`learning/excuse/${data.attendanceEventId}/`))
    throw new AuthorizationError("verified excuse document scope");
  return {downloadUrl:signLearningObject("GET",document.storageKey,undefined,60),expiresInSeconds:60};
  });
 });
