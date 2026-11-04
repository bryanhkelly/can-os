import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { curriculumOverlays, curriculumResources, documents, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { EventTypes } from "@/domain/event-types";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { requireActor } from "@/modules/identity/actors.server";
import { assertPublisherLessonReference, publisherLessonChoices } from "@/domain/publisher-course-references";
import { classVideoFileSchema, classVideoKey, classVideoKeyPattern, hasVideoSignature, videoUploadPolicy } from "@/domain/class-video";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { createPrivateUpload, resolveR2Config, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";
import { authorizeClassVideoManager } from "./class-video-access.server";

const baseInput = z.object({
  sectionId: z.string().uuid(),
  lessonId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
  title: z.string().trim().min(3).max(200),
  fileName: z.string(), contentType: z.enum(["video/mp4", "video/webm"]), size: z.number(),
}).strict();
function validateFile(value: z.infer<typeof baseInput>, ctx: z.RefinementCtx) {
  const parsed = classVideoFileSchema.safeParse(value);
  if (!parsed.success) for (const issue of parsed.error.issues) ctx.addIssue(issue);
}
const input = baseInput.superRefine(validateFile);
const finishInput = baseInput.extend({
  resourceId: z.string().uuid(), key: z.string().regex(classVideoKeyPattern),
  acknowledgedRights: z.literal(true),
}).superRefine(validateFile);

function requireStorage() {
  if (process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED !== "true")
    throw new DomainError("UNAVAILABLE", "Class video uploads require CAN_R2_CURRICULUM_UPLOADS_ENABLED=true.");
  resolveR2Config();
}

export const beginClassVideoUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => input.parse(value))
  .handler(async ({ data }) => {
    requireStorage();
    const actor = await requireActor(["teacher", "registrar"]);
    const section = await authorizeClassVideoManager(actor, data.sectionId);
    if (section.contentStatus !== "published") throw new AuthorizationError("published class");
    assertPublisherLessonReference(section.curriculum, section.contentStatus, data.lessonId);
    const resourceId = randomUUID();
    const key = classVideoKey(actor.actorPersonId, section.id, section.versionId, resourceId);
    return { resourceId, ...createPrivateUpload({
      key, keyPattern: classVideoKeyPattern, contentType: data.contentType,
      contentLength: data.size, minContentLength: videoUploadPolicy.minBytes,
      maxContentLength: videoUploadPolicy.maxBytes, expiresSeconds: 900, preventOverwrite: true,
    }) };
  });

export const finishClassVideoUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => finishInput.parse(value))
  .handler(async ({ data }) => {
    requireStorage();
    const actor = await requireActor(["teacher", "registrar"]);
    const section = await authorizeClassVideoManager(actor, data.sectionId);
    if (data.key !== classVideoKey(actor.actorPersonId, section.id, section.versionId, data.resourceId))
      throw new AuthorizationError("own class video upload");
    await verifyPrivateObject({ key: data.key, keyPattern: classVideoKeyPattern,
      expectedSize: data.size, expectedContentType: data.contentType, verifySignature: hasVideoSignature });
    return db.transaction(async tx => {
      const current = await authorizeClassVideoManager(actor, data.sectionId, tx);
      if (current.contentStatus !== "published" || current.versionId !== section.versionId)
        throw new AuthorizationError("current published class version");
      assertPublisherLessonReference(current.curriculum, current.contentStatus, data.lessonId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.resourceId}))`);
      const [previous] = await tx.select({ id: curriculumOverlays.id, title: curriculumOverlays.title,
        lessonId: curriculumOverlays.lessonId, status: curriculumOverlays.status,
        versionId: curriculumOverlays.courseTemplateVersionId, key: documents.storageKey,
        fileName: documents.fileName, type: documents.mimeType, metadata: documents.metadata })
        .from(curriculumOverlays)
        .innerJoin(curriculumResources, eq(curriculumResources.id, curriculumOverlays.resourceId))
        .innerJoin(documents, eq(documents.id, curriculumResources.documentId))
        .where(and(eq(curriculumOverlays.resourceId, data.resourceId),
          eq(curriculumOverlays.sectionId, current.id),
          eq(curriculumOverlays.createdByPersonId, actor.actorPersonId))).limit(1);
      if (previous) {
        if (previous.title !== data.title || previous.lessonId !== (data.lessonId ?? null) ||
          previous.status !== "active" || previous.versionId !== current.versionId ||
          previous.key !== data.key || previous.type !== data.contentType ||
          previous.fileName !== data.fileName || previous.metadata?.size !== data.size)
          throw new DomainError("CONFLICT", "The video upload was already finalized with different details or retired.");
        return { supplementId: previous.id };
      }
      const [program] = await tx.select().from(programs).where(eq(programs.id, current.programId)).limit(1);
      if (!program || program.siteId !== current.siteId) throw new AuthorizationError("class organization and site");
      const [document] = await tx.insert(documents).values({
        subjectType: "curriculum_resource", subjectId: data.resourceId, category: "curriculum_supplement",
        fileName: data.fileName, storageProvider: "cloudflare_r2", storageKey: data.key,
        mimeType: data.contentType, sensitivityTier: "standard", verifiedAt: new Date(),
        verifiedByPersonId: actor.actorPersonId, uploadedByPersonId: actor.actorPersonId,
        metadata: { size: data.size, storageVerified: true, source: actor.role === "teacher" ? "teacher_supplement" : "school_upload" },
      }).returning({ id: documents.id });
      if (!document) throw new Error("Unable to record verified video.");
      await tx.insert(curriculumResources).values({
        id: data.resourceId, ownerOrganizationId: program.organizationId, kind: "video",
        title: data.title, documentId: document.id, licenseCode: "USER-SUPPLIED",
        metadata: { source: actor.role === "teacher" ? "teacher_supplement" : "school_upload", rightsAcknowledged: true, aiProcessingAllowed: false },
      });
      const [overlay] = await tx.insert(curriculumOverlays).values({
        organizationId: program.organizationId, programId: current.programId, siteId: current.siteId,
        sectionId: current.id, courseTemplateVersionId: current.versionId, lessonId: data.lessonId ?? null,
        title: data.title, kind: "video", resourceId: data.resourceId, createdByPersonId: actor.actorPersonId,
        metadata: { scope: "section", source: actor.role === "teacher" ? "teacher_supplement" : "school_upload", publisherContentModified: false },
      }).returning({ id: curriculumOverlays.id });
      if (!overlay) throw new Error("Unable to attach video.");
      await writeAudit(tx, actor, { action: actor.role === "teacher" ? "curriculum.teacher_supplement.add" : "curriculum.supplement.video_upload", entityType: "curriculum_overlay",
        entityId: overlay.id, scope: { organizationId: program.organizationId, programId: current.programId, sectionId: current.id },
        after: { resourceId: data.resourceId, lessonId: data.lessonId ?? null, kind: "video", publisherCourseVersionUnchanged: current.versionId } });
      await emitEvent(tx, { eventType: EventTypes.CurriculumSupplementAdded, aggregateType: "curriculum_overlay",
        aggregateId: overlay.id, actorPersonId: actor.actorPersonId, programId: current.programId,
        siteId: current.siteId, payload: { sectionId: current.id, source: actor.role === "teacher" ? "teacher_supplement" : "school_upload" } });
      return { supplementId: overlay.id };
    });
  });

export const getStaffClassVideoOptions = createServerFn({ method: "GET" })
    .validator((value: unknown) => z.object({ sectionId: z.string().uuid() }).strict().parse(value))
    .handler(async ({ data }) => {
      setResponseHeader("Cache-Control", "private, no-store");
      const actor = await requireActor(["registrar"]);
      const section = await authorizeClassVideoManager(actor, data.sectionId);
      if (section.contentStatus !== "published") throw new AuthorizationError("published class");
      return { lessons: publisherLessonChoices(section.curriculum, section.contentStatus),
        enabled: process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED === "true" };
    });

export const getStaffClassVideoPreview = createServerFn({ method: "POST" })
    .validator((value: unknown) => z.object({
      sectionId: z.string().uuid(), supplementId: z.string().uuid(),
    }).strict().parse(value))
    .handler(async ({ data }) => {
      setResponseHeader("Cache-Control", "private, no-store");
      const actor = await requireActor(["registrar"]);
      const section = await authorizeClassVideoManager(actor, data.sectionId);
      if (section.contentStatus !== "published" || !section.siteId) throw new AuthorizationError("published class video");
      const [entry] = await db.select({
        key: documents.storageKey, type: documents.mimeType,
        uploader: documents.uploadedByPersonId, resourceId: curriculumResources.id,
      }).from(curriculumOverlays)
        .innerJoin(curriculumResources, eq(curriculumResources.id, curriculumOverlays.resourceId))
        .innerJoin(documents, eq(documents.id, curriculumResources.documentId))
        .innerJoin(programs, eq(programs.id, curriculumOverlays.programId))
        .where(and(eq(curriculumOverlays.id, data.supplementId),
          eq(curriculumOverlays.sectionId, section.id),
          eq(curriculumOverlays.siteId, section.siteId),
          eq(curriculumOverlays.programId, section.programId),
          eq(curriculumOverlays.courseTemplateVersionId, section.versionId),
          eq(curriculumOverlays.status, "active"), eq(curriculumResources.kind, "video"),
          eq(curriculumResources.ownerOrganizationId, programs.organizationId),
          verifiedPrivateDocumentPredicate({ subjectType: "curriculum_resource", subjectId: curriculumResources.id,
            category: "curriculum_supplement", sensitivityTier: "standard" }),
        )).limit(1);
      if (!hasRegistrarAuthority(actor.role) || !entry?.uploader || !entry.type ||
        !videoUploadPolicy.contentTypes.includes(entry.type) ||
        entry.key !== classVideoKey(entry.uploader, section.id, section.versionId, entry.resourceId))
        throw new AuthorizationError("verified private class video");
      return { downloadUrl: signPrivateObjectUrl({ method: "GET", key: entry.key,
        keyPattern: classVideoKeyPattern, expiresSeconds: 900 }) };
    });
