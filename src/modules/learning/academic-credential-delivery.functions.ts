import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq } from "drizzle-orm";
import { z } from "zod";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { academicDocumentPdf } from "@/domain/academic-document-pdf.server";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const target=z.object({kind:z.enum(["transcript","diploma"]),credentialId:uuid});
async function resources(){const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);return {db,s};}
async function registrar(){
 const context=await getCommandContext(getRequest());
 assertCapability(context,"enrollment:manage");
 if(context.role!=="registrar"||!context.actorPersonId)throw new AuthorizationError("issuer registrar");
 return context;
}
async function documentData(db:Awaited<ReturnType<typeof resources>>["db"],s:Awaited<ReturnType<typeof resources>>["s"],kind:"transcript"|"diploma",credentialId:string){
 if(kind==="transcript"){
  const [record]=await db.select().from(s.transcriptIssuances).where(eq(s.transcriptIssuances.id,credentialId)).limit(1);
  if(!record)throw new Error("Transcript issuance not found");
  const snapshot=record.snapshot;
  if(!Array.isArray(snapshot.rows))throw new Error("Transcript snapshot is incomplete");
  const [student]=await db.select({first:s.people.legalFirstName,last:s.people.legalLastName}).from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId)).where(eq(s.studentProfiles.id,record.studentProfileId)).limit(1);
  const [org]=await db.select({name:s.organizations.name}).from(s.organizations).where(eq(s.organizations.id,record.issuingOrganizationId)).limit(1);
  const lines=(snapshot.rows as Array<{sectionTitle:string;letterGrade:string|null;creditsEarned:number|null;schoolYearName:string}>).map(row=>`${row.schoolYearName} | ${row.sectionTitle} | ${row.letterGrade??"N/A"} | Credits: ${row.creditsEarned??"Not recorded"}`);
  return {issuerId:record.issuingOrganizationId,title:"OFFICIAL ACADEMIC TRANSCRIPT",issuer:org?.name??"",student:`${student?.first??""} ${student?.last??""}`,identifier:record.id,issuedAt:record.issuedAt.toISOString().slice(0,10),lines};
 }
 const [record]=await db.select({id:s.diplomaIssuances.id,issuedAt:s.diplomaIssuances.issuedAt,revokedAt:s.diplomaIssuances.revokedAt,decision:s.graduationDecisions.decision,issuerId:s.graduationDecisions.issuingOrganizationId,studentId:s.graduationDecisions.studentProfileId}).from(s.diplomaIssuances).innerJoin(s.graduationDecisions,eq(s.graduationDecisions.id,s.diplomaIssuances.graduationDecisionId)).where(eq(s.diplomaIssuances.id,credentialId)).limit(1);
 if(!record||record.decision!=="approved"||record.revokedAt)throw new Error("No active diploma credential");
 const [student]=await db.select({first:s.people.legalFirstName,last:s.people.legalLastName}).from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId)).where(eq(s.studentProfiles.id,record.studentId)).limit(1);
 const [org]=await db.select({name:s.organizations.name}).from(s.organizations).where(eq(s.organizations.id,record.issuerId)).limit(1);
 return {issuerId:record.issuerId,title:"DIPLOMA",issuer:org?.name??"",student:`${student?.first??""} ${student?.last??""}`,identifier:record.id,issuedAt:record.issuedAt.toISOString().slice(0,10),lines:["Has satisfied the institution's approved graduation requirements.","Issued by the school of record."]};
}
export const renderAcademicCredential=createServerFn({method:"GET"})
 .validator((value:unknown)=>target.parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))throw new AuthorizationError("credential issuer");
  const pdf=academicDocumentPdf(doc);
  return {filename:`${data.kind}-${data.credentialId}.pdf`,base64:Buffer.from(pdf).toString("base64")};
 });

export const deliverAcademicCredential=createServerFn({method:"POST"})
 .validator((value:unknown)=>target.extend({recipientEmail:z.string().email().max(254),recipientName:z.string().trim().min(1).max(150)}).parse(value))
 .handler(async ({data})=>{
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))throw new AuthorizationError("credential issuer");
  const pdf=academicDocumentPdf(doc);
  const [delivery]=await db.insert(s.academicCredentialDeliveries).values({
   issuingOrganizationId:doc.issuerId,transcriptIssuanceId:data.kind==="transcript"?data.credentialId:null,
   diplomaIssuanceId:data.kind==="diploma"?data.credentialId:null,
   recipientEmail:data.recipientEmail.toLowerCase(),recipientName:data.recipientName,
   requestedByPersonId:context.actorPersonId!,
  }).returning({id:s.academicCredentialDeliveries.id});
  if(!delivery)throw new Error("Failed to create delivery request");
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.CAN_NOTIFICATIONS_FROM_EMAIL??process.env.CAN_ACCESS_FROM_EMAIL;
  let accepted=false;let providerMessageId:string|null=null;let lastError:string|null=null;
  if(!apiKey||!from)lastError="Email transport is not configured";
  else{
   try{
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json","Idempotency-Key":delivery.id},body:JSON.stringify({
     from,to:[data.recipientEmail],subject:`Official ${data.kind} from ${doc.issuer}`,
     text:`Dear ${data.recipientName},\n\nAttached is the official ${data.kind} issued by ${doc.issuer}.\nCredential ID: ${doc.identifier}\n\nThis message is confidential and intended for the named recipient.`,
     attachments:[{filename:`${data.kind}-${doc.identifier}.pdf`,content:Buffer.from(pdf).toString("base64")}],
    })});
    const result=await response.json().catch(()=>({})) as {id?:string;message?:string};
    accepted=response.ok&&Boolean(result.id);providerMessageId=accepted?result.id??null:null;
    if(!accepted)lastError=`Email provider rejected delivery (${response.status})`;
   }catch(error){lastError=error instanceof Error?error.message:"Email provider request failed";}
  }
  await db.transaction(async tx=>{
   await tx.update(s.academicCredentialDeliveries).set({status:accepted?"accepted":"failed",providerMessageId,lastError,sentAt:accepted?new Date():null,updatedAt:new Date()}).where(eq(s.academicCredentialDeliveries.id,delivery.id));
   await writeAudit(tx,{actorPersonId:context.actorPersonId!,action:"academic_credential.delivery",resourceType:"academic_credential_delivery",resourceId:delivery.id,scope:{organizationId:doc.issuerId},after:{kind:data.kind,credentialId:data.credentialId,status:accepted?"accepted":"failed",providerMessageId},context:{requestId:context.requestId??null}});
  });
  return {deliveryId:delivery.id,status:accepted?"accepted" as const:"failed" as const};
 });

export const listAcademicCredentialDeliveries=createServerFn({method:"GET"})
 .validator((value:unknown)=>target.parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))throw new AuthorizationError("credential issuer");
  return db.select({id:s.academicCredentialDeliveries.id,recipientEmail:s.academicCredentialDeliveries.recipientEmail,recipientName:s.academicCredentialDeliveries.recipientName,status:s.academicCredentialDeliveries.status,providerMessageId:s.academicCredentialDeliveries.providerMessageId,lastError:s.academicCredentialDeliveries.lastError,createdAt:s.academicCredentialDeliveries.createdAt,sentAt:s.academicCredentialDeliveries.sentAt}).from(s.academicCredentialDeliveries).where(and(eq(s.academicCredentialDeliveries.issuingOrganizationId,doc.issuerId),data.kind==="transcript"?eq(s.academicCredentialDeliveries.transcriptIssuanceId,data.credentialId):eq(s.academicCredentialDeliveries.diplomaIssuanceId,data.credentialId))).orderBy(desc(s.academicCredentialDeliveries.createdAt));
 });
