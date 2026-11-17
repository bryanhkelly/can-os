import { randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  contentAssets, contentAssetVersions, courses, courseVersions,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { classVideoFileSchema, videoUploadPolicy, hasVideoSignature } from "@/domain/class-video";
import { instructionalTrackAssetStorageKey } from "@/domain/instructional-tracks";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertTrackProvider } from "./instructional-track-access.server";
import { createPrivateUpload, resolveR2Config, verifyPrivateObject } from "@/platform/storage/r2";
import { writeAudit } from "@/platform/mutation";

const uuid = z.string().uuid();
const assetKeyPattern = /^learning\/instructional-track\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fileFields=z.object({
  courseVersionId:uuid, title:z.string().trim().min(3).max(200),
  fileName:z.string(),contentType:z.enum(["video/mp4","video/webm"]),size:z.number(),
}).strict();
function checkVideo(value:z.infer<typeof fileFields>,ctx:z.RefinementCtx){
  const result=classVideoFileSchema.safeParse(value);
  if(!result.success)for(const issue of result.error.issues)ctx.addIssue(issue);
}
const beginInput=fileFields.superRefine(checkVideo);
const finishInput=fileFields.extend({
  assetId:uuid,assetVersionId:uuid,key:z.string().regex(assetKeyPattern),
  acknowledgedRights:z.literal(true),
}).superRefine(checkVideo);

function requireVideoUploads() {
  if (process.env.CAN_R2_CURRICULUM_UPLOADS_ENABLED !== "true")
    throw new DomainError("UNAVAILABLE", "Private instructional video uploads are not configured.");
  resolveR2Config();
}
const privateNoStore = () => setResponseHeader("Cache-Control", "private, no-store");

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function requireCurrentPublisher(tx: Tx, actor: Awaited<ReturnType<typeof getCommandContext>>, versionId: string) {
  const [row] = await tx.select({
    courseId: courses.id, organizationId: courses.publisherOrganizationId,
  }).from(courseVersions)
    .innerJoin(courses, eq(courses.id, courseVersions.courseId))
    .where(and(eq(courseVersions.id, versionId),
      eq(courseVersions.lifecycle, "published")))
    .limit(1);
  if (!row) throw new AuthorizationError("published publisher Course version");
  await assertTrackProvider(tx, actor, {
    organizationId: row.organizationId,
    courseId: row.courseId,
    capability: "instructional_track.author",
  });
  return row;
}

/** Begin a private R2 upload for one currently appointed Course creator.
 * A signed URL is not a content publication or learning permission. */
export const beginRecordedVideoUpload = createServerFn({method:"POST"})
  .validator((value:unknown)=>beginInput.parse(value))
  .handler(async({data})=>{
    privateNoStore();
    requireVideoUploads();
    const actor=await getCommandContext(getRequest());
    await db.transaction(tx=>requireCurrentPublisher(tx,actor,data.courseVersionId));
    const assetId=randomUUID();
    const assetVersionId=randomUUID();
    const key=instructionalTrackAssetStorageKey(assetVersionId);
    return {
      assetId, assetVersionId,
      ...createPrivateUpload({
        key,keyPattern:assetKeyPattern,contentType:data.contentType,
        contentLength:data.size,minContentLength:videoUploadPolicy.minBytes,
        maxContentLength:videoUploadPolicy.maxBytes,expiresSeconds:900,
        preventOverwrite:true,
      }),
    };
  });

/** Upload verification, reauthorization and metadata registration are separate
 * from the independent rights/accessibility/academic asset publication review.
 * Immutable asset versions are always created as private drafts. */
export const finishRecordedVideoUpload = createServerFn({method:"POST"})
  .validator((value:unknown)=>finishInput.parse(value))
  .handler(async({data})=>{
    privateNoStore();
    requireVideoUploads();
    const actor=await getCommandContext(getRequest());
    const expectedKey=instructionalTrackAssetStorageKey(data.assetVersionId);
    if (data.key!==expectedKey) throw new AuthorizationError("own immutable asset storage key");
    const fileMetadata={
      source:"creator_video_upload", courseVersionId:data.courseVersionId,
      fileName:data.fileName, contentType:data.contentType, size:data.size,
      uploadedByPersonId:actor.actorPersonId, rightsAcknowledged:true,
      aiProcessingAllowed:false,
    };
    if (!actor.actorPersonId) throw new AuthorizationError("authenticated creator");
    // Never register an unverified or spoofed object, including an incorrect media signature.
    await verifyPrivateObject({
      key:data.key,keyPattern:assetKeyPattern,expectedSize:data.size,
      expectedContentType:data.contentType,verifySignature:hasVideoSignature,
    });
    return db.transaction(async tx=>{
      const publisher=await requireCurrentPublisher(tx,actor,data.courseVersionId);
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.assetVersionId}))`);
      const [prior]=await tx.select({
        id:contentAssetVersions.id,assetId:contentAssetVersions.assetId,
        key:contentAssetVersions.storageReference,
        lifecycle:contentAssetVersions.lifecycle,
        title:contentAssets.title,
        organizationId:contentAssets.ownerOrganizationId,
        terms:contentAssetVersions.licenseTerms,
      }).from(contentAssetVersions)
        .innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
        .where(eq(contentAssetVersions.id,data.assetVersionId)).limit(1);
      if(prior){
        if(prior.assetId!==data.assetId || prior.key!==data.key ||
          prior.title!==data.title || prior.organizationId!==publisher.organizationId ||
          prior.lifecycle!=="draft" ||
          !prior.terms || typeof prior.terms!=="object" || Array.isArray(prior.terms) ||
          !Object.entries(fileMetadata).every(([key,value])=>
            (prior.terms as Record<string,unknown>)[key]===value))
          throw new DomainError("CONFLICT","This video draft was already finalized with different details.");
        return {assetId:data.assetId,assetVersionId:data.assetVersionId,status:"draft" as const};
      }
      await tx.insert(contentAssets).values({
        id:data.assetId,ownerOrganizationId:publisher.organizationId,
        title:data.title,kind:"video",
      });
      await tx.insert(contentAssetVersions).values({
        id:data.assetVersionId,assetId:data.assetId,versionNo:1,
        storageReference:data.key,licenseTerms:fileMetadata,
        lifecycle:"draft",publishedAt:null,
      });
      await writeAudit(tx,actor,{
        action:"instructional.video.uploaded_private_draft",
        entityType:"content_asset_version",entityId:data.assetVersionId,
        scope:{organizationId:publisher.organizationId},
        after:{courseVersionId:data.courseVersionId,
          assetId:data.assetId,contentType:data.contentType,size:data.size,
          requiresIndependentPublication:true},
      });
      return {assetId:data.assetId,assetVersionId:data.assetVersionId,status:"draft" as const};
    });
  });

/** Reloadable creator-only draft inventory, scoped to the exact Course appointment. */
export const getMyRecordedVideoDrafts = createServerFn({method:"GET"})
  .validator((value:unknown)=>z.object({courseVersionId:uuid}).strict().parse(value))
  .handler(async({data})=>{
    privateNoStore();
    const actor=await getCommandContext(getRequest());
    if(!actor.actorPersonId)throw new AuthorizationError("authenticated creator");
    return db.transaction(async tx=>{
      const publisher=await requireCurrentPublisher(tx,actor,data.courseVersionId);
      const rows=await tx.select({
        assetId:contentAssets.id,assetVersionId:contentAssetVersions.id,
        title:contentAssets.title,createdAt:contentAssets.createdAt,
      }).from(contentAssetVersions)
        .innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
        .where(and(eq(contentAssets.ownerOrganizationId,publisher.organizationId),
          eq(contentAssets.kind,"video"),
          eq(contentAssetVersions.lifecycle,"draft"),
          sql`${contentAssetVersions.licenseTerms}->>'source' = 'creator_video_upload'`,
          sql`${contentAssetVersions.licenseTerms}->>'courseVersionId' = ${data.courseVersionId}`,
          sql`${contentAssetVersions.licenseTerms}->>'uploadedByPersonId' = ${actor.actorPersonId}`,
        )).orderBy(desc(contentAssets.createdAt)).limit(50);
      return rows.map(row=>({...row,reviewStatus:"private_draft" as const}));
    });
  });
