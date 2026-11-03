import {randomUUID} from "node:crypto";
import {and,desc,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {actions,documents,programs,sites} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {matchesEnrollmentDocumentSignature} from "@/domain/enrollment-document-signature";
import {validateDocumentUpload} from "@/modules/enrollment/r2-documents.server";
import {createPrivateUpload,verifyPrivateObject} from "@/platform/storage/r2";
import {writeAudit} from "@/platform/mutation";
import {readSchoolJurisdictionReview} from "./school-jurisdiction-review.server";

export const jurisdictionDocumentKeyPattern=
  /^school-jurisdiction\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
export type JurisdictionDocumentUploadInput={
  actionId:string;expiresAt:string;fileName:string;
  mimeType:"application/pdf"|"image/jpeg"|"image/png";size:number;
};
type Reader=Pick<typeof db,"select">;

function requireUploadConfig() {
  if(process.env.CAN_R2_SCHOOL_OPENING_UPLOADS_ENABLED!=="true")
    throw new Error("Private school legal evidence uploads are disabled for this deployment");
}

async function currentAction(
  actor:AccessContext,actionId:string,reader:Reader,
){
  const [record]=await reader.select({
    action:actions,siteId:sites.id,organizationId:programs.organizationId,
    academicProviderOrganizationId:programs.academicProviderOrganizationId,
    programId:programs.id,
  }).from(actions)
    .innerJoin(programs,eq(programs.id,actions.programId))
    .innerJoin(sites,eq(sites.id,programs.siteId))
    .where(eq(actions.id,actionId)).limit(1);
  if(!record||record.action.type!=="school_jurisdiction_requirement"||
    record.action.subjectType!=="program"||
    record.action.subjectId!==record.programId ||
    record.action.siteId!==record.siteId ||
    record.action.programId!==record.programId ||
    record.action.organizationId!==record.organizationId)
    throw new AuthorizationError("canonical Program jurisdiction requirement");
  if(!actor.actorPersonId || actor.sessionAccountId)
    throw new AuthorizationError("verified legal evidence submitter");
  if(record.action.metadata.responsibleParty==="church"){
    if(!hasRegistrarAuthority(actor.role)||
      !actor.scope.organizationIds?.includes(record.organizationId)||
      !actor.scope.siteIds?.includes(record.siteId)||
      !actor.scope.programIds?.includes(record.programId))
      throw new AuthorizationError("responsible church school registrar scope");
    assertCapability(actor,"program.launch.start");
  }else if(record.action.metadata.responsibleParty==="can"){
    if(actor.role!=="can_jurisdiction_reviewer"||actor.grantSiteId!==null||
      !actor.scope.organizationIds?.includes(record.academicProviderOrganizationId))
      throw new AuthorizationError("CAN academic provider legal evidence scope");
    assertCapability(actor,"jurisdiction.profile.verify");
  }else{
    throw new AuthorizationError("family-owned evidence must be submitted through approved family intake");
  }
  const review=await readSchoolJurisdictionReview(actor,record.programId,reader);
  if(review.reviewRequired||!review.policyVersionId||
    record.action.metadata.scopeFingerprint!==review.scopeFingerprint||
    record.action.metadata.profileVersionId!==review.policyVersionId)
    throw new AuthorizationError("renewed CAN school legal review before upload");
  return {...record,review};
}
function checkInput(input:JurisdictionDocumentUploadInput) {
  validateDocumentUpload(input.fileName,input.mimeType,input.size);
  const expiresAt=new Date(input.expiresAt);
  if(!Number.isFinite(expiresAt.getTime())||expiresAt<=new Date())
    throw new Error("Use a future evidence expiry date");
  return expiresAt;
}
/** Short-lived private upload URL, with the owning Action and school checked. */
export async function beginSchoolJurisdictionDocumentUpload(
  actor:AccessContext,input:JurisdictionDocumentUploadInput,
){
  requireUploadConfig();checkInput(input);
  const record=await currentAction(actor,input.actionId,db);
  const key="school-jurisdiction/"+record.programId+"/"+input.actionId+"/"+randomUUID();
  return createPrivateUpload({key,keyPattern:jurisdictionDocumentKeyPattern,
    contentType:input.mimeType,contentLength:input.size,
    minContentLength:16,maxContentLength:10*1024*1024,
    expiresSeconds:180,preventOverwrite:true});
}
/** Verify the uploaded bytes before creating the canonical Document record.
 * Recheck all roles and scope inside a Site-first locked transaction. */
export async function finishSchoolJurisdictionDocumentUpload(
  actor:AccessContext,input:JurisdictionDocumentUploadInput & {key:string},
){
  requireUploadConfig();const expiresAt=checkInput(input);
  if(!jurisdictionDocumentKeyPattern.test(input.key))
    throw new AuthorizationError("canonical legal evidence object key");
  const initial=await currentAction(actor,input.actionId,db);
  if(!input.key.startsWith("school-jurisdiction/"+initial.programId+"/"+input.actionId+"/"))
    throw new AuthorizationError("evidence belongs to this school's legal requirement");
  await verifyPrivateObject({key:input.key,
    keyPattern:jurisdictionDocumentKeyPattern,
    expectedSize:input.size,expectedContentType:input.mimeType,
    verifySignature:matchesEnrollmentDocumentSignature,
  });
  return db.transaction(async tx=>{
    // Match S and C change/approval lock order: Site -> Program -> Action.
    await tx.select({id:sites.id}).from(sites)
      .where(eq(sites.id,initial.siteId)).for("update").limit(1);
    await tx.select({id:programs.id}).from(programs)
      .where(eq(programs.id,initial.programId)).for("update").limit(1);
    await tx.select({id:actions.id}).from(actions)
      .where(eq(actions.id,input.actionId)).for("update").limit(1);
    const current=await currentAction(actor,input.actionId,tx);
    const [existing]=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"program"),eq(documents.subjectId,current.programId),
      eq(documents.storageKey,input.key),
    )).limit(1);
    if(existing){
      if(existing.uploadedByPersonId!==actor.actorPersonId||
        existing.metadata.actionId!==input.actionId ||
        existing.fileName!==input.fileName||
        existing.mimeType!==input.mimeType||
        existing.metadata.size!==input.size ||
        existing.expiresAt?.toISOString()!==expiresAt.toISOString())
        throw new Error("Legal upload key was already recorded with different evidence details");
      return {documentId:existing.id,created:false};
    }
    const prior=await tx.select().from(documents).where(and(
      eq(documents.subjectType,"program"),eq(documents.subjectId,current.programId),
      eq(documents.category,"jurisdiction_requirement_evidence"),
    )).orderBy(desc(documents.createdAt));
    const forAction=prior.filter(document=>document.metadata.actionId===input.actionId);
    const version=forAction.reduce((max,doc)=>Math.max(max,
      typeof doc.metadata.version==="number"?doc.metadata.version:1),0)+1;
    const now=new Date();
    for(const document of forAction){
      if(document.metadata.isCurrent===false)continue;
      await tx.update(documents).set({
        metadata:{...document.metadata,isCurrent:false,supersededAt:now.toISOString()},
        updatedAt:now,
      }).where(eq(documents.id,document.id));
    }
    const [created]=await tx.insert(documents).values({
      subjectType:"program",subjectId:current.programId,
      category:"jurisdiction_requirement_evidence",fileName:input.fileName,
      mimeType:input.mimeType,storageProvider:"cloudflare_r2",
      storageKey:input.key,sensitivityTier:"restricted",expiresAt,
      uploadedByPersonId:actor.actorPersonId!,metadata:{
        actionId:input.actionId,requirementId:current.action.metadata.requirementId,
        policyVersionId:current.review.policyVersionId,
        scopeFingerprint:current.review.scopeFingerprint,
        programId:current.programId,siteId:current.siteId,
        organizationId:current.organizationId,
        size:input.size,storageVerified:true,
        reviewStatus:"pending",isCurrent:true,version,
        submittedAt:now.toISOString(),
      },
    }).returning({id:documents.id});
    if(!created)throw new Error("Unable to persist canonical legal evidence");
    const scope={organizationId:current.organizationId,siteId:current.siteId,
      programId:current.programId};
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.document.uploaded",
      entityType:"document",entityId:created.id,scope,
      after:{actionId:input.actionId,requirementId:current.action.metadata.requirementId,
        version,scopeFingerprint:current.review.scopeFingerprint},
    });
    return {documentId:created.id,created:true};
  });
}
