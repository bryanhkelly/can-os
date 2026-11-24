import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { contentAssets, contentAssetVersions, contentWithdrawals, courses, courseVersions,
  evidenceDocuments, evidenceDocumentVersions, publishedAssetReviews } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { classVideoFileSchema, hasVideoSignature } from "@/domain/class-video";
import { instructionalTrackAssetStorageKey, isVerifiedEvidenceCurrent } from "@/domain/instructional-tracks";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertTrackProvider, type TrackProviderCapability } from "./instructional-track-access.server";
import { verifyPrivateObject, hashPrivateObjectSha256, signPrivateObjectUrl } from "@/platform/storage/r2";
import { writeAudit, emitEvent } from "@/platform/mutation";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor=Awaited<ReturnType<typeof getCommandContext>>;
const uuid=z.string().uuid(), sha=z.string().regex(/^[a-f0-9]{64}$/);
const scope=z.object({courseVersionId:uuid}).strict();
const target=scope.extend({assetVersionId:uuid,expectedHash:sha}).strict();
const kinds=["academic","rights","accessibility"] as const;
const termsSchema=z.object({source:z.literal("creator_video_upload"),courseVersionId:uuid,
 uploadedByPersonId:uuid,fileName:z.string(),contentType:z.enum(["video/mp4","video/webm"]),
 size:z.number(),rightsAcknowledged:z.literal(true),reviewRequestedAt:z.string().datetime().optional()}).passthrough();
const assetKeyPattern=/^learning\/instructional-track\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noStore=()=>setResponseHeader("Cache-Control","private, no-store");
function blocked(message:string):never {throw new DomainError("VALIDATION_FAILED",message);}
async function courseScope(tx:Tx,actor:Actor,courseVersionId:string,capability:TrackProviderCapability){
 const [course]=await tx.select({courseId:courses.id,organizationId:courses.publisherOrganizationId})
 .from(courseVersions).innerJoin(courses,eq(courses.id,courseVersions.courseId))
 .where(and(eq(courseVersions.id,courseVersionId),eq(courseVersions.lifecycle,"published"))).limit(1);
 if(!course)throw new AuthorizationError("published Course appointment");
 await assertTrackProvider(tx,actor,{...course,capability});
 return course;
}
async function loadAsset(tx:Tx,actor:Actor,data:z.infer<typeof target>,capability:TrackProviderCapability){
 const publisher=await courseScope(tx,actor,data.courseVersionId,capability);
 const [asset]=await tx.select({version:contentAssetVersions,title:contentAssets.title})
 .from(contentAssetVersions).innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
 .where(and(eq(contentAssetVersions.id,data.assetVersionId),eq(contentAssets.ownerOrganizationId,publisher.organizationId),
 eq(contentAssets.kind,"video"))).for("update",{of:contentAssetVersions}).limit(1);
 const terms=termsSchema.safeParse(asset?.version.licenseTerms);
 if(!asset||!terms.success||terms.data.courseVersionId!==data.courseVersionId||
 asset.version.sha256!==data.expectedHash||asset.version.storageReference!==instructionalTrackAssetStorageKey(data.assetVersionId))
 throw new AuthorizationError("exact verified Course recording");
 const file=classVideoFileSchema.parse(terms.data);
 const author=terms.data.uploadedByPersonId;
 if(capability==="instructional_track.author"?author!==actor.actorPersonId:author===actor.actorPersonId||!terms.data.reviewRequestedAt)
 throw new AuthorizationError("explicitly submitted recording and independent reviewer");
 if(asset.version.lifecycle!=="draft")blocked("Only private draft recordings may be reviewed.");
 const [withdrawal]=await tx.select({id:contentWithdrawals.id}).from(contentWithdrawals)
 .where(and(eq(contentWithdrawals.assetVersionId,data.assetVersionId),lte(contentWithdrawals.effectiveAt,new Date()))).limit(1);
 if(withdrawal)blocked("Recording has been withdrawn.");
 return {...asset,terms:terms.data,file,publisher,author,key:asset.version.storageReference!};
}
async function verifyMedia(asset:Awaited<ReturnType<typeof loadAsset>>){
 await verifyPrivateObject({key:asset.key,keyPattern:assetKeyPattern,expectedSize:asset.file.size,
 expectedContentType:asset.file.contentType,verifySignature:hasVideoSignature});
 const hash=await hashPrivateObjectSha256({key:asset.key,keyPattern:assetKeyPattern,expectedSize:asset.file.size});
 if(hash!==asset.version.sha256)blocked("Recording bytes changed; upload a new asset version.");
}
async function latestReviews(tx:Tx,id:string){
 const rows=await tx.select().from(publishedAssetReviews).where(eq(publishedAssetReviews.assetVersionId,id))
 .orderBy(desc(publishedAssetReviews.decisionOrder)).limit(1001);
 if(rows.length>1000)blocked("Asset review history exceeds supported limit.");
 return kinds.map(kind=>({kind,review:rows.find(r=>r.reviewKind===kind)}));
}
async function requireEvidence(tx:Tx,id:string,organizationId:string,kind:string,author:string){
 const [e]=await tx.select({kind:evidenceDocuments.kindCode,verifiedAt:evidenceDocumentVersions.verifiedAt,
 verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,validFrom:evidenceDocumentVersions.validFrom,
 validThrough:evidenceDocumentVersions.validThrough}).from(evidenceDocumentVersions)
 .innerJoin(evidenceDocuments,eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
 .where(and(eq(evidenceDocumentVersions.id,id),eq(evidenceDocuments.owningOrganizationId,organizationId))).limit(1);
 if(!e||e.verifiedByPersonId===author||!isVerifiedEvidenceCurrent({...e,at:new Date()})||
 (kind==="rights"&&e.kind!=="rights"))blocked("Current independent publisher evidence is required.");
}
export const submitRecordedVideoForReview=createServerFn({method:"POST"}).validator((raw:unknown)=>target.parse(raw))
 .handler(async({data})=>{noStore();const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
 const asset=await loadAsset(tx,actor,data,"instructional_track.author");
 if(asset.terms.reviewRequestedAt)return {submitted:true};
 await verifyMedia(asset);
 await tx.update(contentAssetVersions).set({licenseTerms:{...asset.version.licenseTerms as object,reviewRequestedAt:new Date().toISOString()}})
 .where(eq(contentAssetVersions.id,data.assetVersionId));
 await writeAudit(tx,actor,{action:"instructional.video.review_requested",entityType:"content_asset_version",entityId:data.assetVersionId,
 scope:{organizationId:asset.publisher.organizationId},after:{sha256:data.expectedHash,courseVersionId:data.courseVersionId}});
 return {submitted:true};
 });});
export const listRecordedVideoReviews=createServerFn({method:"GET"}).validator((raw:unknown)=>scope.parse(raw))
 .handler(async({data})=>{noStore();const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
 const publisher=await courseScope(tx,actor,data.courseVersionId,"instructional_track.review");
 const rows=await tx.select({id:contentAssetVersions.id,title:contentAssets.title,sha256:contentAssetVersions.sha256,terms:contentAssetVersions.licenseTerms})
 .from(contentAssetVersions).innerJoin(contentAssets,eq(contentAssets.id,contentAssetVersions.assetId))
 .where(and(eq(contentAssets.ownerOrganizationId,publisher.organizationId),eq(contentAssets.kind,"video"),
 eq(contentAssetVersions.lifecycle,"draft"),
 sql`${contentAssetVersions.licenseTerms}->>'courseVersionId' = ${data.courseVersionId}`,
 sql`${contentAssetVersions.licenseTerms}->>'reviewRequestedAt' IS NOT NULL`,
 sql`${contentAssetVersions.licenseTerms}->>'uploadedByPersonId' <> ${actor.actorPersonId}`))
 .orderBy(desc(contentAssets.createdAt),contentAssetVersions.id).limit(51);
 const items=[];
 for(const row of rows.slice(0,50)){
 const terms=termsSchema.safeParse(row.terms);
 if(!terms.success||!terms.data.reviewRequestedAt||!row.sha256||!sha.safeParse(row.sha256).success)continue;
 const reviews=await latestReviews(tx,row.id);
 items.push({id:row.id,title:row.title,sha256:row.sha256,reviews:reviews.map(({kind,review})=>({kind,decision:review?.decision??null,
 independent:!!review&&review.reviewerPersonId!==terms.data.uploadedByPersonId}))});
 }
 return {items,limited:rows.length>50};
 });});
export const previewRecordedVideoForReview=createServerFn({method:"POST"}).validator((raw:unknown)=>target.parse(raw))
 .handler(async({data})=>{noStore();const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
 const asset=await loadAsset(tx,actor,data,"instructional_track.review");
 await verifyMedia(asset);
 return {downloadUrl:signPrivateObjectUrl({method:"GET",key:asset.key,keyPattern:assetKeyPattern,expiresSeconds:300})};
 });});
const decisionInput=target.extend({kind:z.enum(kinds),decision:z.enum(["approved","rejected"]),evidenceVersionId:uuid,rationale:z.string().trim().min(10).max(2000)}).strict();
export const decideRecordedVideoReview=createServerFn({method:"POST"}).validator((raw:unknown)=>decisionInput.parse(raw))
 .handler(async({data})=>{noStore();const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
 const asset=await loadAsset(tx,actor,data,"instructional_track.review");
 await requireEvidence(tx,data.evidenceVersionId,asset.publisher.organizationId,data.kind,asset.author);
 await verifyMedia(asset);
 const prior=(await latestReviews(tx,data.assetVersionId)).find(r=>r.kind===data.kind)?.review;
 if(prior?.decision===data.decision&&prior.evidenceVersionId===data.evidenceVersionId&&prior.reviewerPersonId===actor.actorPersonId)return {recorded:true};
 const [review]=await tx.insert(publishedAssetReviews).values({assetVersionId:data.assetVersionId,reviewKind:data.kind,decision:data.decision,
 reviewerPersonId:actor.actorPersonId!,evidenceVersionId:data.evidenceVersionId}).returning({id:publishedAssetReviews.id});
 if(!review)throw new Error("Asset review not recorded");
 await writeAudit(tx,actor,{action:"instructional.video.review_decided",entityType:"content_asset_version",entityId:data.assetVersionId,
 scope:{organizationId:asset.publisher.organizationId},after:{reviewId:review.id,kind:data.kind,decision:data.decision,evidenceVersionId:data.evidenceVersionId,rationale:data.rationale,sha256:data.expectedHash}});
 return {recorded:true};
 });});
export const publishReviewedRecordedVideo=createServerFn({method:"POST"}).validator((raw:unknown)=>target.parse(raw))
 .handler(async({data})=>{noStore();const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
 const asset=await loadAsset(tx,actor,data,"instructional_track.publish");
 for(const {kind,review} of await latestReviews(tx,data.assetVersionId)){
 if(!review||review.decision!=="approved"||review.reviewerPersonId===asset.author||!review.evidenceVersionId)
 blocked("Every mandatory category requires current independent approval.");
 await requireEvidence(tx,review.evidenceVersionId,asset.publisher.organizationId,kind,asset.author);
 }
 await verifyMedia(asset);
 const [published]=await tx.update(contentAssetVersions).set({lifecycle:"published",publishedAt:new Date()})
 .where(and(eq(contentAssetVersions.id,data.assetVersionId),eq(contentAssetVersions.lifecycle,"draft"))).returning({id:contentAssetVersions.id});
 if(!published)blocked("Recording version changed.");
 await writeAudit(tx,actor,{action:"instructional.video.published",entityType:"content_asset_version",entityId:data.assetVersionId,
 scope:{organizationId:asset.publisher.organizationId},after:{sha256:data.expectedHash,courseVersionId:data.courseVersionId}});
 await emitEvent(tx,{eventType:"InstructionalVideoPublished",aggregateType:"content_asset_version",aggregateId:data.assetVersionId,
 actorPersonId:actor.actorPersonId,organizationId:asset.publisher.organizationId,payload:{courseVersionId:data.courseVersionId,sha256:data.expectedHash}});
 return {published:true};
 });});
