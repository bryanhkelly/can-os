import {randomUUID} from "node:crypto";
import {and,desc,eq,inArray} from "drizzle-orm";
import {db} from "@/db/client";
import {documents,sites} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {AuthorizationError} from "@/domain/command-context";
import {siteWebsiteLocalPublishCapability} from "@/domain/site-publication-policy";
import {matchesEnrollmentDocumentSignature} from "@/domain/enrollment-document-signature";
import {siteMediaUploadSchema,siteMediaReviewSchema,siteMediaRevokeSchema,
  siteMediaDecorativeAlt,suggestSiteMediaTags} from "@/domain/site-media-folder";
import type {SiteMediaPhoto} from "@/domain/school-site-media-selection";
import {createPrivateUpload,verifyPrivateObject} from "@/platform/storage/r2";
import {writeAudit} from "@/platform/mutation";
import {requirePartnerWebsiteEditor} from "./site-website-authorization.server";
import {z} from "zod";

export const siteMediaKeyPattern=/^school-site-media\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
export const siteMediaCategory="school_site_website_media";
type Reader=Pick<typeof db,"select">;

function assertEnabled(){
  if(process.env.CAN_R2_SITE_MEDIA_UPLOADS_ENABLED!=="true")
    throw new Error("School media folder uploads are disabled on this deployment");
}
async function editorForSite(actor:AccessContext,siteId:string,reader:Reader=db){
  const site=await requirePartnerWebsiteEditor(actor,reader,siteWebsiteLocalPublishCapability);
  if(site.id!==siteId)throw new AuthorizationError("Site website media scope");
  return site;
}

export async function beginSiteMediaFolderUpload(
  actor:AccessContext,raw:z.input<typeof siteMediaUploadSchema>,
){
  assertEnabled();
  const input=siteMediaUploadSchema.parse(raw);
  await editorForSite(actor,input.siteId);
  const key=`school-site-media/${input.siteId}/${randomUUID()}`;
  return createPrivateUpload({key,keyPattern:siteMediaKeyPattern,
    contentType:input.mimeType,contentLength:input.size,
    minContentLength:16,maxContentLength:8*1024*1024,
    expiresSeconds:180,preventOverwrite:true});
}

/** Only a verified private R2 object becomes a candidate Document. It is not
 * a published photo until explicitly reviewed by the Site's authorized editor. */
export async function finishSiteMediaFolderUpload(
  actor:AccessContext,raw:z.input<typeof siteMediaUploadSchema>&{key:string},
){
  assertEnabled();
  const input=siteMediaUploadSchema.parse(raw);
  if(!siteMediaKeyPattern.test(raw.key)||
    !raw.key.startsWith(`school-site-media/${input.siteId}/`))
    throw new AuthorizationError("Canonical Site media upload key");
  await editorForSite(actor,input.siteId);
  await verifyPrivateObject({key:raw.key,keyPattern:siteMediaKeyPattern,
    expectedSize:input.size,expectedContentType:input.mimeType,
    verifySignature:matchesEnrollmentDocumentSignature});
  return db.transaction(async tx=>{
    const site=await editorForSite(actor,input.siteId,tx);
    const [locked]=await tx.select({id:sites.id}).from(sites)
      .where(eq(sites.id,site.id)).for("update").limit(1);
    if(!locked)throw new AuthorizationError("School Site no longer exists");
    const [existing]=await tx.select().from(documents)
      .where(and(eq(documents.subjectType,"site"),eq(documents.subjectId,site.id),
        eq(documents.storageKey,raw.key))).limit(1);
    if(existing){
      if(existing.uploadedByPersonId!==actor.actorPersonId ||
        existing.mimeType!==input.mimeType ||
        existing.fileName!==input.fileName ||
        existing.metadata.size!==input.size)
        throw new AuthorizationError("Media object already belongs to a different upload");
      return {documentId:existing.id,created:false};
    }
    const now=new Date();
    const tags=suggestSiteMediaTags(input.folderPath,input.fileName);
    const [created]=await tx.insert(documents).values({
      subjectType:"site",subjectId:site.id,category:siteMediaCategory,
      fileName:input.fileName,storageProvider:"cloudflare_r2",storageKey:raw.key,
      mimeType:input.mimeType,sensitivityTier:"restricted",
      uploadedByPersonId:actor.actorPersonId!,metadata:{
        siteId:site.id,size:input.size,width:input.width,height:input.height,
        tags,altText:siteMediaDecorativeAlt(tags),
        visualFamily:null,sourceRevision:raw.key.split("/").at(-1),
        rightsStatus:"pending",subjectReleaseStatus:"pending",
        mediaReviewStatus:"pending",storageVerified:true,
        folderSource:"authorized_browser_folder",
        submittedAt:now.toISOString(),
      },
    }).returning({id:documents.id});
    if(!created)throw new Error("Could not record uploaded media");
    await writeAudit(tx,actor,{
      action:"site.website.media.staged",entityType:"document",entityId:created.id,
      scope:{organizationId:site.organizationId,siteId:site.id},
      after:{size:input.size,mimeType:input.mimeType,status:"pending"},
    });
    return {documentId:created.id,created:true};
  });
}

/** One explicit folder-wide review avoids image-by-image decisions; every
 * included file must be covered by copyright AND subject-release attestation.
 * No classifier can confer either permission. */
export async function reviewSiteMediaFolder(
  actor:AccessContext,raw:z.input<typeof siteMediaReviewSchema>,
){
  assertEnabled();
  const input=siteMediaReviewSchema.parse(raw);
  return db.transaction(async tx=>{
    const site=await editorForSite(actor,input.siteId,tx);
    const [locked]=await tx.select({id:sites.id}).from(sites)
      .where(eq(sites.id,site.id)).for("update").limit(1);
    if(!locked)throw new AuthorizationError("Site is unavailable");
    const entries=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"site"),eq(documents.subjectId,site.id),
      eq(documents.category,siteMediaCategory),
      inArray(documents.id,input.documentIds),
    )).for("update");
    if(entries.length!==input.documentIds.length)
      throw new AuthorizationError("All reviewed images must belong to this Site");
    const approved=entries.filter(entry=>entry.metadata.mediaReviewStatus!=="approved");
    if(approved.some(entry=>entry.storageProvider!=="cloudflare_r2" ||
      entry.metadata.storageVerified!==true ||
      !siteMediaKeyPattern.test(entry.storageKey) ||
      !entry.storageKey.startsWith(`school-site-media/${site.id}/`)))
      throw new AuthorizationError("Private uploaded media verification is required");
    const now=new Date();
    for(const entry of approved)await tx.update(documents).set({
      metadata:{...entry.metadata,rightsStatus:"approved",
        subjectReleaseStatus:input.subjectRelease==="no_identifiable_people"
          ?"not_required":"cleared",mediaReviewStatus:"approved",
        reviewedAt:now.toISOString(),reviewedByPersonId:actor.actorPersonId},
      verifiedAt:now,verifiedByPersonId:actor.actorPersonId,updatedAt:now,
    }).where(eq(documents.id,entry.id));
    if(approved.length)await writeAudit(tx,actor,{
      action:"site.website.media.folder_reviewed",entityType:"site",entityId:site.id,
      scope:{organizationId:site.organizationId,siteId:site.id},
      after:{documentIds:approved.map(entry=>entry.id),count:approved.length,
        subjectRelease:input.subjectRelease,reason:input.reason},
    });
    return {approved:approved.length,total:entries.length};
  });
}

/** Revoke every placement, including its public proxy, immediately on the next
 * request. Uploaded bytes stay private; this never exposes a stale photo. */
export async function revokeSiteMediaFolder(
  actor:AccessContext,raw:z.input<typeof siteMediaRevokeSchema>,
){
  const input=siteMediaRevokeSchema.parse(raw);
  return db.transaction(async tx=>{
    const site=await editorForSite(actor,input.siteId,tx);
    await tx.select({id:sites.id}).from(sites)
      .where(eq(sites.id,site.id)).for("update").limit(1);
    const entries=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"site"),eq(documents.subjectId,site.id),
      eq(documents.category,siteMediaCategory),inArray(documents.id,input.documentIds),
    )).for("update");
    if(entries.length!==new Set(input.documentIds).size)
      throw new AuthorizationError("All revoked media must belong to this Site");
    const now=new Date();
    for(const entry of entries)await tx.update(documents).set({
      metadata:{...entry.metadata,rightsStatus:"revoked",
        mediaReviewStatus:"rejected",revokedAt:now.toISOString()},
      updatedAt:now,
    }).where(eq(documents.id,entry.id));
    await writeAudit(tx,actor,{
      action:"site.website.media.revoked",entityType:"site",entityId:site.id,
      scope:{organizationId:site.organizationId,siteId:site.id},
      after:{documentIds:entries.map(entry=>entry.id),reason:input.reason},
    });
    return {revoked:entries.length};
  });
}

export async function listSiteMediaFolder(actor:AccessContext,siteId:string){
  await editorForSite(actor,siteId);
  const entries=await db.select().from(documents).where(and(
    eq(documents.subjectType,"site"),eq(documents.subjectId,siteId),
    eq(documents.category,siteMediaCategory),
  )).orderBy(desc(documents.createdAt)).limit(200);
  return entries.map(entry=>({
    documentId:entry.id,fileName:entry.fileName,
    tags:Array.isArray(entry.metadata.tags)
      ?entry.metadata.tags.filter((tag):tag is string=>typeof tag==="string") : [],
    reviewStatus:entry.metadata.mediaReviewStatus==="approved"?"approved":
      entry.metadata.mediaReviewStatus==="rejected"?"revoked":"pending",
    width:typeof entry.metadata.width==="number"?entry.metadata.width:0,
    height:typeof entry.metadata.height==="number"?entry.metadata.height:0,
  }));
}

export async function readApprovedSchoolSitePhotos(
  siteId:string,reader:Reader=db,
):Promise<SiteMediaPhoto[]>{
  const rows=await reader.select().from(documents).where(and(
    eq(documents.subjectType,"site"),eq(documents.subjectId,siteId),
    eq(documents.category,siteMediaCategory),
  )).orderBy(desc(documents.createdAt)).limit(200);
  return rows.filter(row=>
    row.storageProvider==="cloudflare_r2"&&
    row.metadata.storageVerified===true &&
    row.metadata.mediaReviewStatus==="approved"&&
    row.metadata.rightsStatus==="approved"&&
    ["cleared","not_required"].includes(String(row.metadata.subjectReleaseStatus))&&
    siteMediaKeyPattern.test(row.storageKey)&&
    row.storageKey.startsWith(`school-site-media/${siteId}/`)&&
    row.mimeType!==null&&["image/png","image/jpeg"].includes(row.mimeType)
  ).map(row=>({
    id:row.id,siteId,
    width:typeof row.metadata.width==="number"?row.metadata.width:0,
    height:typeof row.metadata.height==="number"?row.metadata.height:0,
    tags:Array.isArray(row.metadata.tags)
      ?row.metadata.tags.filter((tag):tag is string=>typeof tag==="string"):[],
    altText:typeof row.metadata.altText==="string"?row.metadata.altText:"",
    rightsStatus:"approved",subjectReleaseStatus:
      row.metadata.subjectReleaseStatus==="cleared"?"cleared":"not_required",
    mediaReviewStatus:"approved",
    sourceRevision:typeof row.metadata.sourceRevision==="string"
      ?row.metadata.sourceRevision:row.id,
    visualFamily:typeof row.metadata.visualFamily==="string"
      ?row.metadata.visualFamily:null,
  }));
}
