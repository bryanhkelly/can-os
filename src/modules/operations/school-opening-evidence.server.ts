import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { documents, programs } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError } from "@/domain/command-context";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { EventTypes } from "@/domain/event-types";
import {
  schoolOpeningEvidenceCategories, type beginSchoolOpeningEvidenceUploadSchema,
  type finishSchoolOpeningEvidenceUploadSchema, type reviewSchoolOpeningEvidenceSchema,
  type schoolOpeningEvidenceDownloadSchema,
} from "@/domain/school-opening-evidence";
import { createPrivateUploadUrl, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";
import { emitEvent, notifyMany, writeAudit } from "@/platform/mutation";
import { validateDocumentUpload } from "@/modules/enrollment/r2-documents.server";
import {
  latestConfiguration, schoolIdentity, verifyCANSchoolApprover, verifyChurchEvidenceSubmitter,
  verifySchoolOpeningReader,
} from "./school-opening.server";
import type { z } from "zod";

const keyPattern=/^school-opening\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
type BeginInput=z.infer<typeof beginSchoolOpeningEvidenceUploadSchema>;
type FinishInput=z.infer<typeof finishSchoolOpeningEvidenceUploadSchema>;
type ReviewInput=z.infer<typeof reviewSchoolOpeningEvidenceSchema>;
type DownloadInput=z.infer<typeof schoolOpeningEvidenceDownloadSchema>;

function assertUploadsEnabled() {
  if(process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED!=="true")
    throw new Error("School-opening evidence uploads are not enabled for this deployment");
}
async function currentSubmissionContext(actor:AccessContext,input:BeginInput,reader:Pick<typeof db,"select">=db) {
  const school=await schoolIdentity(reader,input.programId);
  verifyChurchEvidenceSubmitter(actor,school);
  const configuration=await latestConfiguration(reader,input.programId);
  if(configuration.id!==input.configurationId||configuration.version!==input.expectedVersion)
    throw new Error("School configuration changed. Reload before submitting evidence.");
  if(configuration.status==="suspended")
    throw new AuthorizationError("a new reviewed school configuration draft before more evidence");
  const expiresAt=new Date(input.expiresAt);
  if(expiresAt<=new Date())throw new Error("Evidence expiry must be in the future");
  return {school,configuration,expiresAt};
}
function scope(school:{institutionId:string;siteId:string;programId:string},organizationId?:string) {
  return {organizationId:organizationId??school.institutionId,siteId:school.siteId,programId:school.programId};
}

export async function beginSchoolOpeningEvidenceUpload(actor:AccessContext,input:BeginInput) {
  assertUploadsEnabled();
  validateDocumentUpload(input.fileName,input.mimeType,input.size);
  await currentSubmissionContext(actor,input);
  const key=`school-opening/${input.programId}/${randomUUID()}`;
  return {key,uploadHeaders:{"Content-Type":input.mimeType,"If-None-Match":"*"},
    uploadUrl:createPrivateUploadUrl({key,keyPattern,contentType:input.mimeType,contentLength:input.size,
      minContentLength:16,maxContentLength:10*1024*1024,expiresSeconds:180,preventOverwrite:true})};
}

export async function finishSchoolOpeningEvidenceUpload(actor:AccessContext,input:FinishInput) {
  assertUploadsEnabled();
  validateDocumentUpload(input.fileName,input.mimeType,input.size);
  if(!input.key.startsWith(`school-opening/${input.programId}/`))
    throw new AuthorizationError("evidence upload belongs to this Program");
  await currentSubmissionContext(actor,input);
  await verifyPrivateObject({key:input.key,keyPattern,expectedSize:input.size,
    expectedContentType:input.mimeType,verifySignature:matchesEnrollmentDocumentSignature});
  return db.transaction(async tx=>{
    await tx.select({id:programs.id}).from(programs).where(eq(programs.id,input.programId)).for("update").limit(1);
    const {school,configuration,expiresAt}=await currentSubmissionContext(actor,input,tx);
    const [existing]=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"program"),eq(documents.subjectId,input.programId),eq(documents.storageKey,input.key),
    )).limit(1);
    if(existing) {
      if(existing.uploadedByPersonId!==actor.actorPersonId||existing.category!==input.category||
        existing.fileName!==input.fileName||existing.mimeType!==input.mimeType||existing.metadata.size!==input.size||
        existing.metadata.configurationId!==configuration.id||existing.expiresAt?.toISOString()!==expiresAt.toISOString())
        throw new Error("This upload was already recorded with different evidence details");
      return {documentId:existing.id,
        version:typeof existing.metadata.version==="number"?existing.metadata.version:1,created:false};
    }
    const versions=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"program"),eq(documents.subjectId,input.programId),eq(documents.category,input.category),
    )).orderBy(desc(documents.createdAt),desc(documents.id)).for("update");
    const version=versions.reduce((max,document)=>Math.max(max,
      typeof document.metadata.version==="number"?document.metadata.version:1),0)+1;
    const now=new Date();
    for(const previous of versions) {
      if(previous.metadata.isCurrent===false)continue;
      await tx.update(documents).set({metadata:{...previous.metadata,isCurrent:false,
        supersededAt:now.toISOString(),supersededByUploadKey:input.key},updatedAt:now})
        .where(eq(documents.id,previous.id));
    }
    const [document]=await tx.insert(documents).values({
      subjectType:"program",subjectId:input.programId,category:input.category,fileName:input.fileName,
      storageProvider:"cloudflare_r2",storageKey:input.key,mimeType:input.mimeType,sensitivityTier:"restricted",
      expiresAt,uploadedByPersonId:actor.actorPersonId!,metadata:{
        size:input.size,storageVerified:true,reviewStatus:"pending",version,isCurrent:true,
        configurationId:configuration.id,configurationVersion:configuration.version,
        siteId:school.siteId,organizationId:school.organizationId,
        institutionOrganizationId:school.institutionId,jurisdictionId:school.jurisdictionId,
        programId:school.programId,submittedAt:now.toISOString(),
      },
    }).returning({id:documents.id});
    if(!document)throw new Error("Could not record school-opening evidence");
    await writeAudit(tx,actor,{action:"school.opening.evidence.submitted",entityType:"document",entityId:document.id,
      scope:scope(school,school.organizationId),after:{category:input.category,version,
        configurationId:configuration.id,expiresAt:expiresAt.toISOString(),supersededDocumentIds:versions.map(row=>row.id)}});
    await emitEvent(tx,{eventType:EventTypes.ChurchSchoolOpeningEvidenceSubmitted,aggregateType:"document",
      aggregateId:document.id,actorPersonId:actor.actorPersonId,organizationId:school.organizationId,
      siteId:school.siteId,programId:school.programId,payload:{category:input.category,version,
        configurationId:configuration.id}});
    return {documentId:document.id,version,created:true};
  });
}

export async function reviewSchoolOpeningEvidence(actor:AccessContext,input:ReviewInput) {
  const reason=input.reason.trim();
  return db.transaction(async tx=>{
    await tx.select({id:programs.id}).from(programs).where(eq(programs.id,input.programId)).for("update").limit(1);
    const school=await schoolIdentity(tx,input.programId);
    verifyCANSchoolApprover(actor,school.institutionId);
    const configuration=await latestConfiguration(tx,input.programId);
    const [document]=await tx.select().from(documents).where(and(
      eq(documents.id,input.documentId),eq(documents.subjectType,"program"),eq(documents.subjectId,input.programId),
    )).for("update").limit(1);
    if(!document||!schoolOpeningEvidenceCategoryGuard(document.category))
      throw new AuthorizationError("school-opening evidence in this Program");
    const version=typeof document.metadata.version==="number"?document.metadata.version:1;
    if(version!==input.expectedVersion)throw new Error("Evidence version changed. Reload the review.");
    const [latest]=await tx.select({id:documents.id}).from(documents).where(and(
      eq(documents.subjectType,"program"),eq(documents.subjectId,input.programId),eq(documents.category,document.category),
    )).orderBy(desc(documents.createdAt),desc(documents.id)).limit(1);
    if(latest?.id!==document.id||document.metadata.isCurrent===false||
      document.metadata.configurationId!==configuration.id||document.metadata.siteId!==school.siteId||
      document.metadata.organizationId!==school.organizationId||
      document.metadata.institutionOrganizationId!==school.institutionId||
      document.metadata.jurisdictionId!==school.jurisdictionId||document.metadata.storageVerified!==true||
      document.storageProvider!=="cloudflare_r2"||!keyPattern.test(document.storageKey)||
      !document.storageKey.startsWith(`school-opening/${input.programId}/`))
      throw new AuthorizationError("current storage-verified evidence bound to the reviewed school configuration");
    if(document.uploadedByPersonId===actor.actorPersonId)
      throw new AuthorizationError("independent evidence reviewer other than the uploader");
    if(!document.expiresAt||document.expiresAt<=new Date())
      throw new AuthorizationError("unexpired school-opening evidence");
    const priorDecision=document.metadata.reviewStatus==="approved"?"approve":
      document.metadata.reviewStatus==="rejected"?"reject":null;
    if(priorDecision) {
      if(priorDecision===input.decision&&document.metadata.reviewReason===reason&&
        document.metadata.reviewedByPersonId===actor.actorPersonId)
        return {documentId:document.id,status:priorDecision,changed:false};
      throw new Error("This evidence version was already reviewed; submit a corrected new version");
    }
    const now=new Date();
    await tx.update(documents).set({verifiedAt:input.decision==="approve"?now:null,
      verifiedByPersonId:input.decision==="approve"?actor.actorPersonId:null,
      metadata:{...document.metadata,reviewStatus:input.decision==="approve"?"approved":"rejected",
        reviewReason:reason,reviewedAt:now.toISOString(),reviewedByPersonId:actor.actorPersonId},updatedAt:now,
    }).where(eq(documents.id,document.id));
    await writeAudit(tx,actor,{action:"school.opening.evidence.reviewed",entityType:"document",entityId:document.id,
      scope:scope(school),before:{reviewStatus:"pending"},after:{decision:input.decision,reason,version,
        configurationId:configuration.id}});
    const eventId=await emitEvent(tx,{eventType:EventTypes.ChurchSchoolOpeningEvidenceReviewed,aggregateType:"document",
      aggregateId:document.id,actorPersonId:actor.actorPersonId,organizationId:school.institutionId,
      siteId:school.siteId,programId:school.programId,payload:{category:document.category,version,
        decision:input.decision,configurationId:configuration.id}});
    // Close the loop with the church submitter: a rejection they never learn
    // about silently stalls the school's opening evidence. The reason itself
    // stays in the review workspace; the notification carries no file content.
    if(document.uploadedByPersonId)
      await notifyMany(tx,[{
        recipientPersonId:document.uploadedByPersonId,
        type:"school_opening_evidence_reviewed",
        title:input.decision==="approve"
          ?"School-opening evidence approved"
          :"School-opening evidence needs a corrected version",
        body:input.decision==="approve"
          ?"An independent CAN reviewer approved your submitted school-opening evidence. Other categories may still be outstanding."
          :"An independent CAN reviewer did not approve your submitted school-opening evidence. Open the school-opening workspace to read the reason and submit a corrected new version.",
        resourceType:"document",resourceId:document.id,eventId,
      }]);
    return {documentId:document.id,status:input.decision,changed:true};
  });
}

function schoolOpeningEvidenceCategoryGuard(category:string) {
  return (schoolOpeningEvidenceCategories as readonly string[]).includes(category);
}

export async function getSchoolOpeningEvidenceDownload(actor:AccessContext,input:DownloadInput) {
  const school=await schoolIdentity(db,input.programId);
  verifySchoolOpeningReader(actor,school);
  const [document]=await db.select().from(documents).where(and(
    eq(documents.id,input.documentId),eq(documents.subjectType,"program"),eq(documents.subjectId,input.programId),
  )).limit(1);
  if(!document||!schoolOpeningEvidenceCategoryGuard(document.category)||
    document.storageProvider!=="cloudflare_r2"||document.metadata.storageVerified!==true||
    document.metadata.siteId!==school.siteId||document.metadata.organizationId!==school.organizationId||
    document.metadata.institutionOrganizationId!==school.institutionId||
    document.metadata.jurisdictionId!==school.jurisdictionId||!keyPattern.test(document.storageKey)||
    !document.storageKey.startsWith(`school-opening/${input.programId}/`))
    throw new AuthorizationError("school-opening evidence within this exact school");
  return db.transaction(async tx=>{
    await writeAudit(tx,actor,{action:"school.opening.evidence.read",entityType:"document",entityId:document.id,
      scope:scope(school,actor.role==="registrar"?school.organizationId:school.institutionId),
      after:{category:document.category,version:document.metadata.version??1}});
    return {downloadUrl:signPrivateObjectUrl({method:"GET",key:document.storageKey,keyPattern,expiresSeconds:60}),
      expiresInSeconds:60};
  });
}
