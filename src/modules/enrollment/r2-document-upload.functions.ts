import {createServerFn} from "@tanstack/react-start";
import {and,eq,desc} from "drizzle-orm";
import {db} from "@/db/client";
import {applications,journeys,journeyRequirements,documents,auditEvents} from "@/db/schema";
import {assertSyntheticMutation} from "@/modules/student-experience/demo-write-gate";
import {newDocumentKey,signR2Object,validateDocumentUpload,r2Config} from "./r2-documents.server";
const REGISTRAR="f1000000-0000-4000-8000-000000000006";
function uploadsEnabled(){
 assertSyntheticMutation("registrar");
 if(process.env.CAN_R2_DEMO_UPLOADS_ENABLED!=="true")throw new Error("R2 demo uploads are disabled");
}
async function requirementScope(applicationId:string,requirementId:string){
 const [app]=await db.select({id:applications.id,metadata:applications.metadata}).from(applications).where(eq(applications.id,applicationId)).limit(1);
 if(!app||app.metadata.synthetic!==true)throw new Error("Synthetic application not found");
 const [journey]=await db.select({id:journeys.id,status:journeys.status}).from(journeys).where(and(eq(journeys.participantType,"application"),eq(journeys.participantId,app.id))).limit(1);
 if(!journey||["active","complete","cancelled"].includes(journey.status))throw new Error("Enrollment journey is closed");
 const [requirement]=await db.select({id:journeyRequirements.id}).from(journeyRequirements).where(and(eq(journeyRequirements.id,requirementId),eq(journeyRequirements.journeyId,journey.id))).limit(1);
 if(!requirement)throw new Error("Requirement is outside the application");
}
export const beginSyntheticR2DocumentUpload=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;fileName:string;mimeType:string;size:number})=>data)
 .handler(async({data})=>{
  uploadsEnabled();validateDocumentUpload(data.fileName,data.mimeType,data.size);
  await requirementScope(data.applicationId,data.requirementId);
  const key=newDocumentKey(data.applicationId,data.requirementId);
  return {key,uploadUrl:signR2Object("PUT",key,data.mimeType,180),expiresInSeconds:180};
 });
export const finishSyntheticR2DocumentUpload=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;key:string;fileName:string;mimeType:string;size:number})=>data)
 .handler(async({data})=>{
  uploadsEnabled();validateDocumentUpload(data.fileName,data.mimeType,data.size);
  if(!data.key.startsWith("enrollment/"+data.applicationId+"/"+data.requirementId+"/"))throw new Error("Document belongs to another application");
  await requirementScope(data.applicationId,data.requirementId);
  r2Config();
  const response=await fetch(signR2Object("HEAD",data.key,undefined,30),{method:"HEAD"});
  if(!response.ok)throw new Error("Uploaded R2 object could not be verified");
  const contentLength=Number(response.headers.get("content-length"));
  if(contentLength!==data.size)throw new Error("Uploaded document size does not match");
  const returnedType=response.headers.get("content-type");
  if(returnedType&&returnedType!==data.mimeType)throw new Error("Uploaded document type does not match");
  return db.transaction(async tx=>{
   const [existing]=await tx.select({id:documents.id}).from(documents).where(and(eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageKey,data.key))).limit(1);
   if(existing)return {documentId:existing.id,created:false};
   const versions=await tx.select({id:documents.id,metadata:documents.metadata}).from(documents)
    .where(and(eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageProvider,"cloudflare_r2")))
    .orderBy(desc(documents.createdAt)).for("update");
   const owned=versions.filter(v=>v.metadata.synthetic===true&&v.metadata.applicationId===data.applicationId);
   const version=owned.reduce((max,v)=>Math.max(max,typeof v.metadata.version==="number"?v.metadata.version:1),0)+1;
   for(const old of owned){
    if(old.metadata.isCurrent===false)continue;
    await tx.update(documents).set({metadata:{...old.metadata,isCurrent:false,supersededAt:new Date().toISOString()},updatedAt:new Date()}).where(eq(documents.id,old.id));
   }
   const [document]=await tx.insert(documents).values({subjectType:"journey_requirement",subjectId:data.requirementId,category:"enrollment",fileName:data.fileName,storageProvider:"cloudflare_r2",storageKey:data.key,mimeType:data.mimeType,sensitivityTier:"restricted",uploadedByPersonId:REGISTRAR,metadata:{synthetic:true,applicationId:data.applicationId,size:data.size,reviewStatus:"received",version,isCurrent:true}}).returning({id:documents.id});
   if(!document)throw new Error("Could not record document");
   await tx.insert(auditEvents).values({actorPersonId:REGISTRAR,action:"synthetic.enrollment.document.upload",resourceType:"document",resourceId:document.id,after:{requirementId:data.requirementId,storageProvider:"cloudflare_r2"},context:{synthetic:true}});
   return {documentId:document.id,created:true};
  });
 });

/** Restricted synthetic registrar-only document retrieval; never expose raw R2 keys. */
export const getSyntheticR2DocumentDownload=createServerFn({method:"POST"})
 .validator((data:{applicationId:string;requirementId:string;documentId:string})=>data)
 .handler(async({data})=>{
  uploadsEnabled();
  await requirementScope(data.applicationId,data.requirementId);
  const [record]=await db.select({id:documents.id,storageKey:documents.storageKey,metadata:documents.metadata})
   .from(documents).where(and(eq(documents.id,data.documentId),eq(documents.subjectType,"journey_requirement"),eq(documents.subjectId,data.requirementId),eq(documents.storageProvider,"cloudflare_r2"))).limit(1);
  if(!record||record.metadata.synthetic!==true||record.metadata.applicationId!==data.applicationId)throw new Error("Document not found within synthetic enrollment scope");
  const expectedPrefix="enrollment/"+data.applicationId+"/"+data.requirementId+"/";
  if(!record.storageKey.startsWith(expectedPrefix))throw new Error("Document storage scope mismatch");
  return {downloadUrl:signR2Object("GET",record.storageKey,undefined,60),expiresInSeconds:60};
 });
