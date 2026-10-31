import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,isNotNull,isNull } from "drizzle-orm";
import { z } from "zod";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { academicDocumentPdf } from "@/domain/academic-document-pdf.server";
import { canAuthorizeAcademicCredentialRelease, canDownloadAuthorizedCredential } from "@/domain/academic-credential-release";
import { writeAudit } from "@/platform/mutation";

const uuid=z.string().uuid();
const target=z.object({kind:z.enum(["transcript","diploma"]),credentialId:uuid});
async function resources(){const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);return {db,s};}
async function registrar(){
 const context=await getCommandContext(getRequest());
 assertCapability(context,"enrollment:manage");
 if(context.role!=="registrar"||!context.actorPersonId||context.demoFacilitator)throw new AuthorizationError("verified issuer registrar");
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
  // Generating an official record is a privileged disclosure, even without email.
  // Do not cache or share the resulting response outside the authorized registrar session.
  const pdf=academicDocumentPdf(doc);
  return {filename:`${data.kind}-${data.credentialId}.pdf`,base64:Buffer.from(pdf).toString("base64")};
 });

/** A registrar can authorize a release only to an existing verified person with
 * a recorded consent reference and release instructions. This does NOT send it. */
export const authorizeAcademicCredentialRelease=createServerFn({method:"POST"})
 .validator((value:unknown)=>target.extend({
  recipientPersonId:uuid,recipientEmail:z.string().email().max(254),
  releasePurpose:z.string().trim().min(5).max(300),
  instructionReference:z.string().trim().min(5).max(500),
  consentEvidenceReference:z.string().trim().min(5).max(500),
  expiresAt:z.string().datetime(),
 }).strict().parse(value))
 .handler(async ({data})=>{
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))throw new AuthorizationError("credential issuer");
  const expiry=new Date(data.expiresAt);
  if(expiry.getTime()<=Date.now()||expiry.getTime()>Date.now()+30*86400000)
    throw new AuthorizationError("Release expiry must be within 30 days");
  // The baseline provides no trusted records-release instruction or consent
  // verification interface. Never interpret caller-supplied reference strings
  // as independent evidence or create an authorization from them.
  const approved=canAuthorizeAcademicCredentialRelease({
    issuerMatches:true, studentMatches:false, verifiedRecipient:false,
    trustedInstructions:false, validAuthorityEvidence:false,
    registrarApproved:true, demoActor:!!context.demoFacilitator,
    purpose:"student_request", expiresAt:expiry, now:new Date(),
  });
  if(!approved)throw new AuthorizationError("Independent recipient, consent and release-instruction verification is required before authorizing external disclosure");
  throw new AuthorizationError("Credential release authorization requires a trusted institution evidence interface");
 });

export const revokeAcademicCredentialRelease=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({authorizationId:uuid}).strict().parse(value))
 .handler(async ({data})=>{
  const context=await registrar();const {db,s}=await resources();
  return db.transaction(async tx=>{
   const [changed]=await tx.update(s.academicCredentialReleaseAuthorizations)
    .set({revokedAt:new Date(),updatedAt:new Date()})
    .where(and(eq(s.academicCredentialReleaseAuthorizations.id,data.authorizationId),
      inArray(s.academicCredentialReleaseAuthorizations.issuingOrganizationId,context.scope.organizationIds??[]),
      isNull(s.academicCredentialReleaseAuthorizations.revokedAt)))
    .returning({id:s.academicCredentialReleaseAuthorizations.id,issuerId:s.academicCredentialReleaseAuthorizations.issuingOrganizationId});
   if(changed){
    await writeAudit(tx,context,{action:"academic_credential.release.revoke",entityType:"academic_credential_release_authorization",entityId:changed.id,scope:{organizationId:changed.issuerId}});
    return {revoked:true};
   }
   const [existing]=await tx.select({id:s.academicCredentialReleaseAuthorizations.id})
    .from(s.academicCredentialReleaseAuthorizations)
    .where(and(eq(s.academicCredentialReleaseAuthorizations.id,data.authorizationId),
      inArray(s.academicCredentialReleaseAuthorizations.issuingOrganizationId,context.scope.organizationIds??[]),
      isNotNull(s.academicCredentialReleaseAuthorizations.revokedAt))).limit(1);
   if(!existing)throw new AuthorizationError("issuer authorization");
   return {revoked:true};
  });
 });

/** Authenticated recipient download. No bearer token, email attachment or public URL.
 * Only an independently authorized, unexpired and non-revoked ledger entry
 * can be redeemed by its exact named recipient in a live session. */
export const downloadAuthorizedAcademicCredential=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({authorizationId:uuid}).strict().parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await getCommandContext(getRequest());
  if(!context.actorPersonId||context.demoFacilitator)throw new AuthorizationError("authenticated recipient");
  const {db,s}=await resources();
  const [release]=await db.select().from(s.academicCredentialReleaseAuthorizations)
   .where(and(eq(s.academicCredentialReleaseAuthorizations.id,data.authorizationId),
    eq(s.academicCredentialReleaseAuthorizations.recipientPersonId,context.actorPersonId)))
   .limit(1);
  if(!release||release.revokedAt||release.expiresAt<=new Date())
   throw new AuthorizationError("active recipient authorization");
  const [recipient]=await db.select({email:s.people.email,active:s.people.active})
   .from(s.people).where(eq(s.people.id,context.actorPersonId)).limit(1);
  if(!canDownloadAuthorizedCredential({actorPersonId:context.actorPersonId,recipientPersonId:release.recipientPersonId,recipientEmail:release.recipientEmail,accountEmail:recipient?.email??null,recipientActive:recipient?.active??false,expiresAt:release.expiresAt,revokedAt:release.revokedAt,now:new Date(),demoFacilitator:!!context.demoFacilitator}))
   throw new AuthorizationError("recipient identity or release validity mismatch");
  if(!context.accountId||!context.sessionId||!context.grantId)throw new AuthorizationError("verified active recipient session");
  const [verifiedAccount]=await db.select({id:s.accessAccounts.id})
   .from(s.accessAccounts)
   .innerJoin(s.accountPersonGrants,eq(s.accountPersonGrants.accountId,s.accessAccounts.id))
   .where(and(eq(s.accessAccounts.id,context.accountId),
    eq(s.accessAccounts.disabled,false),
    isNotNull(s.accessAccounts.emailVerifiedAt),
    eq(s.accessAccounts.emailNormalized,release.recipientEmail.trim().toLowerCase()),
    eq(s.accountPersonGrants.id,context.grantId),
    eq(s.accountPersonGrants.personId,context.actorPersonId),
    eq(s.accountPersonGrants.active,true),
    eq(s.accountPersonGrants.isSynthetic,false)))
   .limit(1);
  if(!verifiedAccount)throw new AuthorizationError("verified recipient account required");
  const kind=release.transcriptIssuanceId?"transcript":"diploma";
  const credentialId=release.transcriptIssuanceId??release.diplomaIssuanceId;
  if(!credentialId)throw new AuthorizationError("credential release target");
  const doc=await documentData(db,s,kind,credentialId);
  if(doc.issuerId!==release.issuingOrganizationId)throw new AuthorizationError("credential issuer mismatch");
  await writeAudit(db,context,{action:"academic_credential.release.download",entityType:"academic_credential_release_authorization",entityId:release.id,scope:{organizationId:release.issuingOrganizationId},after:{recipientPersonId:context.actorPersonId,credentialId}});
  const pdf=academicDocumentPdf(doc);
  return {filename:`${kind}-${credentialId}.pdf`,base64:Buffer.from(pdf).toString("base64")};
 });

/** The authenticated recipient can discover only their own active releases. */
export const listMyAcademicCredentialReleases=createServerFn({method:"GET"})
 .handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await getCommandContext(getRequest());
  if(!context.actorPersonId||!context.accountId||!context.grantId||context.demoFacilitator)
   throw new AuthorizationError("authenticated recipient");
  const {db,s}=await resources();
  const now=new Date();
  const {gt}=await import("drizzle-orm");
  return db.select({id:s.academicCredentialReleaseAuthorizations.id,
    transcriptId:s.academicCredentialReleaseAuthorizations.transcriptIssuanceId,
    diplomaId:s.academicCredentialReleaseAuthorizations.diplomaIssuanceId,
    purpose:s.academicCredentialReleaseAuthorizations.releasePurpose,
    expiresAt:s.academicCredentialReleaseAuthorizations.expiresAt})
   .from(s.academicCredentialReleaseAuthorizations)
   .innerJoin(s.accessAccounts,eq(s.accessAccounts.id,context.accountId))
   .innerJoin(s.accountPersonGrants,and(eq(s.accountPersonGrants.id,context.grantId),eq(s.accountPersonGrants.accountId,s.accessAccounts.id)))
   .innerJoin(s.people,eq(s.people.id,s.academicCredentialReleaseAuthorizations.recipientPersonId))
   .where(and(eq(s.academicCredentialReleaseAuthorizations.recipientPersonId,context.actorPersonId),
    isNull(s.academicCredentialReleaseAuthorizations.revokedAt),
    gt(s.academicCredentialReleaseAuthorizations.expiresAt,now),
    eq(s.accessAccounts.disabled,false),isNotNull(s.accessAccounts.emailVerifiedAt),
    eq(s.accessAccounts.emailNormalized,s.academicCredentialReleaseAuthorizations.recipientEmail),
    eq(s.accountPersonGrants.personId,context.actorPersonId),eq(s.accountPersonGrants.active,true),
    eq(s.accountPersonGrants.isSynthetic,false),eq(s.people.active,true)))
   .orderBy(desc(s.academicCredentialReleaseAuthorizations.authorizedAt)).limit(100);
 });

/** Official records must never be mailed as plaintext attachments. Release is
 * disabled until a verified records-request and authenticated download workflow
 * exist. This server guard protects even stale clients and direct POST calls. */
export const deliverAcademicCredential=createServerFn({method:"POST"})
 .validator((value:unknown)=>target.extend({recipientEmail:z.string().email().max(254),recipientName:z.string().trim().min(1).max(150)}).parse(value))
 .handler(async ({data})=>{
  await registrar();
  void data;
  throw new AuthorizationError("Credential release is unavailable pending verified recipient authorization, release instructions, consent and secure access. No PDF was sent.");
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
