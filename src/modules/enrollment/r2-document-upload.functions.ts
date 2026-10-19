import { db } from "@/db/client";
import { applications,documents,guardianRelationships,journeyRequirements,journeys,programs,studentProfiles } from "@/db/schema";
import { assertR2DemoEnabled,assertR2DocumentGrant } from "@/domain/r2-document-access";
import { assertSyntheticMutation } from "@/modules/_demo/demo-write-gate";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,desc,eq,sql } from "drizzle-orm";
import { z } from "zod";
import { newDocumentKey,r2Config,signR2Object,validateDocumentUpload,verifyDocumentObject } from "./r2-documents.server";
async function uploadsEnabled(applicationId:string,mode:"upload"|"download"="upload"){

 const context=await getCommandContext(getRequest());
 if(!context.actorPersonId)throw new Error("Authenticated person required");
 const [app]=await db.select({programId:applications.programId,studentProfileId:applications.studentProfileId,metadata:applications.metadata}).from(applications).where(eq(applications.id,applicationId)).limit(1);
 if(!app)throw new Error("Application not found");
 if(mode==="upload"&&app.metadata.synthetic===true){
  assertR2DemoEnabled(process.env.CAN_R2_DEMO_UPLOADS_ENABLED);
  assertSyntheticMutation(context.role);
 }else if(mode==="upload"&&process.env.CAN_R2_LIVE_UPLOADS_ENABLED!=="true"){
  throw new Error("Live enrollment document uploads are not enabled for this deployment");
 }
 const [programScope]=await db.select({siteId:programs.siteId,organizationId:programs.organizationId})
  .from(programs).where(eq(programs.id,app.programId)).limit(1);
 if(!programScope||!programScope.siteId||!context.scope.programIds?.includes(app.programId)||
  !context.scope.siteIds?.includes(programScope.siteId))
  throw new Error("Enrollment document outside authorized school or program");
 if(context.role==="registrar"){
   assertR2DocumentGrant({role:context.role,actorPersonId:context.actorPersonId,organizationIds:context.scope.organizationIds},{organizationId:programScope.organizationId,guardianCanManage:false});
 }else if(context.role==="guardian"){
  const [student]=await db.select({personId:studentProfiles.personId}).from(studentProfiles).where(eq(studentProfiles.id,app.studentProfileId)).limit(1);
  if(!student)throw new Error("Student missing");
  const [relationship]=await db.select({id:guardianRelationships.id}).from(guardianRelationships).where(and(eq(guardianRelationships.studentPersonId,student.personId),eq(guardianRelationships.guardianPersonId,context.actorPersonId),eq(guardianRelationships.canManageEnrollment,true))).limit(1);
  assertR2DocumentGrant({role:context.role,actorPersonId:context.actorPersonId},{organizationId:"",guardianCanManage:Boolean(relationship)});
 }else throw new Error("Enrollment documents require registrar or guardian access");
 return context.actorPersonId;
}
async function requirementScope(applicationId:string,requirementId:string,allowClosed=false){
 const [app]=await db.select({id:applications.id}).from(applications).where(eq(applications.id,applicationId)).limit(1);
 if(!app)throw new Error("Application not found");
 const [journey]=await db.select({id:journeys.id,status:journeys.status}).from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,app.id))).limit(1);
 if(!journey||(!allowClosed&&["active","complete","cancelled"].includes(journey.status)))throw new Error("Enrollment journey is closed or unavailable");
 const [requirement]=await db.select({id:journeyRequirements.id}).from(journeyRequirements).where(and(eq(journeyRequirements.id,requirementId),eq(journeyRequirements.journeyId,journey.id))).limit(1);
 if(!requirement)throw new Error("Requirement is outside the application");
}
export const beginEnrollmentDocumentUpload=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({applicationId:z.string().uuid(),requirementId:z.string().uuid(),fileName:z.string().min(1).max(150),mimeType:z.enum(["application/pdf","image/jpeg","image/png"]),size:z.number().int().min(16).max(10*1024*1024)}).parse(data))
 .handler(async({data})=>{
  await uploadsEnabled(data.applicationId);validateDocumentUpload(data.fileName,data.mimeType,data.size);
  await requirementScope(data.applicationId,data.requirementId);
  const key=newDocumentKey(data.applicationId,data.requirementId);
  return {key,uploadUrl:signR2Object("PUT",key,data.mimeType,180),expiresInSeconds:180};
 });
export const finishEnrollmentDocumentUpload=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({applicationId:z.string().uuid(),requirementId:z.string().uuid(),key:z.string().regex(/^enrollment\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i),fileName:z.string().min(1).max(150),mimeType:z.enum(["application/pdf","image/jpeg","image/png"]),size:z.number().int().min(16).max(10*1024*1024)}).parse(data))
 .handler(async({data})=>{
  const actorId=await uploadsEnabled(data.applicationId);validateDocumentUpload(data.fileName,data.mimeType,data.size);
  if(!data.key.startsWith("enrollment/"+data.applicationId+"/"+data.requirementId+"/"))throw new Error("Document belongs to another application");
  await requirementScope(data.applicationId,data.requirementId);
  await verifyDocumentObject(data.key,data.mimeType,data.size);
  return db.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${data.requirementId}))`);
   const [existing]=await tx.select({id:documents.id}).from(documents).where(and(eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageKey,data.key))).limit(1);
   if(existing)return {documentId:existing.id,created:false};
   const [journey]=await tx.select({id:journeys.id,status:journeys.status}).from(journeys)
    .where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,data.applicationId))).for("update").limit(1);
   if(!journey||["active","complete","cancelled"].includes(journey.status))throw new Error("Enrollment journey is closed");
   const [requirement]=await tx.select({id:journeyRequirements.id,status:journeyRequirements.status,evidence:journeyRequirements.evidence}).from(journeyRequirements)
    .where(and(eq(journeyRequirements.id,data.requirementId),eq(journeyRequirements.journeyId,journey.id))).for("update").limit(1);
   if(!requirement)throw new Error("Requirement is outside the application");
   const versions=await tx.select({id:documents.id,metadata:documents.metadata}).from(documents)
    .where(and(eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageProvider,"cloudflare_r2")))
    .orderBy(desc(documents.createdAt)).for("update");
   const owned=versions.filter(v=>v.metadata.applicationId===data.applicationId);
   const version=owned.reduce((max,v)=>Math.max(max,typeof v.metadata.version==="number"?v.metadata.version:1),0)+1;
   for(const old of owned){
    if(old.metadata.isCurrent===false)continue;
    await tx.update(documents).set({metadata:{...old.metadata,isCurrent:false,supersededAt:new Date().toISOString()},updatedAt:new Date()}).where(eq(documents.id,old.id));
   }
   const [document]=await tx.insert(documents).values({subjectType:"journey_requirement",subjectId:data.requirementId,category:"enrollment",fileName:data.fileName,storageProvider:"cloudflare_r2",storageKey:data.key,mimeType:data.mimeType,sensitivityTier:"restricted",uploadedByPersonId:actorId,metadata:{applicationId:data.applicationId,size:data.size,storageVerified:true,reviewStatus:"received",version,isCurrent:true}}).returning({id:documents.id});
   if(!document)throw new Error("Could not record document");
   const now=new Date();
   await tx.update(journeyRequirements).set({status:"needs_you",completedAt:null,updatedAt:now,
    evidence:[...requirement.evidence,{kind:"document_review",status:"received",documentId:document.id,
     text:"New file uploaded; review required.",reviewedAt:now.toISOString()}]}).where(eq(journeyRequirements.id,requirement.id));
   await tx.update(journeys).set({status:"in_progress",completedAt:null,updatedAt:now}).where(eq(journeys.id,journey.id));
   await writeAudit(tx, {actorPersonId:actorId,action:"enrollment.document.resubmitted",resourceType:"journey_requirement",resourceId:requirement.id,
    before:{status:requirement.status},after:{status:"needs_you",documentId:document.id,version},context:{applicationId:data.applicationId}});
   const [appRecord]=await tx.select({metadata:applications.metadata}).from(applications).where(eq(applications.id,data.applicationId)).limit(1);
   await writeAudit(tx, {actorPersonId:actorId,action:"enrollment.document.upload",resourceType:"document",resourceId:document.id,after:{requirementId:data.requirementId,storageProvider:"cloudflare_r2"},context:{applicationId:data.applicationId,synthetic:appRecord?.metadata.synthetic===true}});
   return {documentId:document.id,created:true};
  });
 });

/** Short-lived document retrieval after application and guardian/registrar scope checks. */
export const getEnrollmentDocumentDownload=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({applicationId:z.string().uuid(),requirementId:z.string().uuid(),documentId:z.string().uuid()}).parse(data))
 .handler(async({data})=>{
  await uploadsEnabled(data.applicationId,"download");
  await requirementScope(data.applicationId,data.requirementId,true);
  const [record]=await db.select({id:documents.id,storageKey:documents.storageKey,metadata:documents.metadata})
   .from(documents).where(and(eq(documents.id,data.documentId),eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageProvider,"cloudflare_r2"))).limit(1);
  if(!record||record.metadata.applicationId!==data.applicationId||record.metadata.isCurrent===false)throw new Error("Document not found within the current enrollment requirement");
  const expectedPrefix="enrollment/"+data.applicationId+"/"+data.requirementId+"/";
  if(!record.storageKey.startsWith(expectedPrefix))throw new Error("Document storage scope mismatch");
  return {downloadUrl:signR2Object("GET",record.storageKey,undefined,60),expiresInSeconds:60};
 });

/** Deployment switches only; never exposes R2 credentials. */
export const getEnrollmentDocumentUploadAvailability=createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 if(!context.actorPersonId||!["registrar","guardian"].includes(context.role))
  throw new Error("Enrollment document access denied");
 let configured=true;
 try{r2Config()}catch{configured=false}
 return {
  live:configured&&process.env.CAN_R2_LIVE_UPLOADS_ENABLED==="true",
  demo:configured&&process.env.CAN_R2_DEMO_UPLOADS_ENABLED==="true",
 };
});
