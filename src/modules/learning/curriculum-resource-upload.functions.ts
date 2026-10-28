import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { documents, curriculumResources, curriculumOverlays, sections, courseTemplateVersions, curriculumAdoptions, curriculumEntitlements, curriculumPackItems, programs } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { readClassContent } from "@/domain/class-content";
import { curriculumPdfKeyPattern, maxCurriculumPdfBytes, hasPdfMagic, isCurriculumPdfKeyForResource } from "@/domain/curriculum-resource-file";
import { requireActor } from "@/modules/identity/actors.server";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { createPrivateUploadUrl, verifyPrivateObject, resolveR2Config } from "@/platform/storage/r2";
import { readMarketplace } from "./curriculum-marketplace.server";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();
const keyPattern = /^learning\/supplements\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const maxPdf = 10 * 1024 * 1024;
const context = z.object({
  programId: uuid, courseVersionId: uuid, sectionId: uuid.optional(),
  scope: z.enum(["program","site","section"]),
  lessonId: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).optional(),
}).strict();
const file = context.extend({
  title: z.string().trim().min(3).max(200),
  fileName: z.string().trim().min(1).max(150).regex(/\.pdf$/i),
  size: z.number().int().min(16).max(maxPdf),
}).strict();
const finalInput = file.extend({
  resourceId: uuid,
  key: z.string().regex(keyPattern),
  acknowledgedRights: z.literal(true),
}).strict();

function requireStorage() {
  if (process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED !== "true")
    throw new Error("Curriculum PDF uploads are not enabled on this deployment.");
  resolveR2Config();
}
async function authorizeInput(input: z.infer<typeof context>) {
  const actor = await requireActor(["registrar"]);
  const market = await readMarketplace(actor, input.programId);
  if (!market.packs.some(p => p.entitlement === "active" && p.adoption?.status === "active" &&
    p.courses.some(c => c.courseVersionId === input.courseVersionId)))
    throw new AuthorizationError("adopted curriculum course");
  if (input.scope === "site" && !market.program.siteId)
    throw new AuthorizationError("site curriculum scope");
  if (input.scope === "section") {
    const section = market.sections.find(s => s.id === input.sectionId);
    if (!section || section.courseVersionId !== input.courseVersionId)
      throw new AuthorizationError("authorized section using the selected course");
  } else if (input.sectionId) throw new Error("Section ID only applies to a class-level resource.");
  if (input.lessonId) {
    const [version] = await db.select({curriculum: courseTemplateVersions.curriculum})
      .from(courseTemplateVersions).where(eq(courseTemplateVersions.id,input.courseVersionId)).limit(1);
    const content = version && readClassContent(version.curriculum);
    if (!content?.modules.some(module=>module.lessons.some(lesson=>lesson.id===input.lessonId)))
      throw new Error("Lesson ID is outside the selected published course.");
  }
  return { actor, market };
}

/** Presigned private PDF upload: authenticated publisher scope and short-lived, single-object PUT. */
export const beginCurriculumPdfUpload = createServerFn({method:"POST"})
  .validator((value: unknown) => file.parse(value))
  .handler(async ({data}) => {
    requireStorage();
    await authorizeInput(data);
    const resourceId = randomUUID();
    const key = `learning/supplements/${resourceId}/${randomUUID()}`;
    return {
      resourceId,key,expiresInSeconds:180,
      uploadUrl:createPrivateUploadUrl({
        key,keyPattern,contentType:"application/pdf",
        contentLength:data.size,minContentLength:16,maxContentLength:maxPdf,
        expiresSeconds:180,preventOverwrite:true,
      }),
    };
  });

/** Reverify all scope and file properties, verify object HEAD and magic bytes, then publish atomically. */
export const finishCurriculumPdfUpload = createServerFn({method:"POST"})
  .validator((value: unknown) => finalInput.parse(value))
  .handler(async ({data}) => {
    requireStorage();
    const {actor,market} = await authorizeInput(data);
    if (!isCurriculumPdfKeyForResource(data.key, data.resourceId))
      throw new AuthorizationError("matching private resource key");
    await verifyPrivateObject({
      key:data.key,keyPattern,expectedSize:data.size,expectedContentType:"application/pdf",
      verifySignature: (_type,bytes) => hasPdfMagic(bytes),
    });
    return db.transaction(async tx => {
      // Revalidate the course entitlement in the mutation transaction.
      const [licensed] = await tx.select({id:curriculumAdoptions.id})
        .from(curriculumAdoptions)
        .innerJoin(curriculumEntitlements,and(
          eq(curriculumEntitlements.packId,curriculumAdoptions.packId),
          eq(curriculumEntitlements.organizationId,curriculumAdoptions.organizationId),
          eq(curriculumEntitlements.status,"active")))
        .innerJoin(curriculumPackItems,eq(curriculumPackItems.packVersionId,curriculumAdoptions.packVersionId))
        .where(and(eq(curriculumAdoptions.programId,data.programId),
          eq(curriculumAdoptions.status,"active"),
          eq(curriculumPackItems.courseTemplateVersionId,data.courseVersionId))).limit(1);
      if (!licensed) throw new AuthorizationError("active licensed curriculum release");
      if (data.scope === "section") {
        const [section] = await tx.select({id:sections.id,programId:sections.programId,
          versionId:sections.courseTemplateVersionId,siteId:sections.siteId})
          .from(sections).where(eq(sections.id,data.sectionId!)).limit(1);
        if (!section || section.programId !== data.programId ||
          section.versionId !== data.courseVersionId || section.siteId!==market.program.siteId)
          throw new AuthorizationError("current section scope");
      }
      const [previous] = await tx.select({id:curriculumResources.id})
        .from(curriculumResources).where(eq(curriculumResources.id,data.resourceId)).limit(1);
      if (previous) throw new Error("This upload has already been finalized.");
      const [doc] = await tx.insert(documents).values({
        subjectType:"curriculum_resource",subjectId:data.resourceId,category:"curriculum_supplement",
        fileName:data.fileName,storageProvider:"cloudflare_r2",storageKey:data.key,
        mimeType:"application/pdf",sensitivityTier:"standard",verifiedAt:new Date(),
        verifiedByPersonId:actor.actorPersonId,uploadedByPersonId:actor.actorPersonId,
        metadata:{size:data.size,storageVerified:true,source:"curriculum_marketplace"},
      }).returning({id:documents.id});
      if (!doc) throw new Error("Unable to record verified resource.");
      const [program] = await tx.select({organizationId:programs.organizationId,
        siteId:programs.siteId}).from(programs).where(eq(programs.id,data.programId)).limit(1);
      if (!program || program.siteId !== market.program.siteId)
        throw new AuthorizationError("active program site and school");
      await tx.insert(curriculumResources).values({
        id:data.resourceId,ownerOrganizationId:program.organizationId,
        kind:"pdf",title:data.title,documentId:doc.id,licenseCode:"USER-SUPPLIED",
        metadata:{source:"school_upload",rightsAcknowledged:true,aiProcessingAllowed:false,size:data.size},
      });
      const [overlay] = await tx.insert(curriculumOverlays).values({
        organizationId:program.organizationId,
        programId:data.programId,
        siteId:data.scope==="site"||data.scope==="section"?market.program.siteId:null,
        sectionId:data.scope==="section"?data.sectionId:null,
        courseTemplateVersionId:data.courseVersionId,lessonId:data.lessonId??null,
        title:data.title,kind:"pdf",resourceId:data.resourceId,
        createdByPersonId:actor.actorPersonId,
        metadata:{scope:data.scope,source:"school_upload"},
      }).returning({id:curriculumOverlays.id});
      if (!overlay) throw new Error("Unable to add the uploaded PDF to curriculum.");
      await writeAudit(tx,actor,{action:"curriculum.supplement.pdf_upload",entityType:"curriculum_overlay",
        entityId:overlay.id,scope:{programId:data.programId,sectionId:data.sectionId??null},
        after:{resourceId:data.resourceId,documentId:doc.id,courseVersionId:data.courseVersionId,
          title:data.title,scope:data.scope,lessonId:data.lessonId??null}});
      await emitEvent(tx,{eventType:EventTypes.CurriculumSupplementAdded,aggregateType:"curriculum_overlay",
        aggregateId:overlay.id,actorPersonId:actor.actorPersonId,programId:data.programId,
        siteId:market.program.siteId,payload:{resourceId:data.resourceId,kind:"pdf"}});
      return {supplementId:overlay.id,resourceId:data.resourceId};
    });
  });

export const curriculumPdfUploadAvailability = createServerFn({method:"GET"})
  .handler(async () => {
    setResponseHeader("Cache-Control","private, no-store");
    await requireActor(["registrar"],"curriculum.publish");
    let configured=true;
    try{resolveR2Config();}catch{configured=false;}
    return {enabled:configured && process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED==="true"};
  });
