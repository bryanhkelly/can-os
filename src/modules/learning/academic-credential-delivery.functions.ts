import { createServerFn } from "@tanstack/react-start";
import { getRequest,setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,gt,inArray,isNotNull,isNull,sql } from "drizzle-orm";
import { z } from "zod";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { academicDocumentPdf } from "@/domain/academic-document-pdf.server";
import { canAuthorizeAcademicCredentialRelease, canDownloadAuthorizedCredential, canRedeemTransferCredential } from "@/domain/academic-credential-release";
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
  return {studentProfileId:record.studentProfileId,issuerId:record.issuingOrganizationId,title:"OFFICIAL ACADEMIC TRANSCRIPT",issuer:org?.name??"",student:`${student?.first??""} ${student?.last??""}`,identifier:record.id,issuedAt:record.issuedAt.toISOString().slice(0,10),lines};
 }
 const [record]=await db.select({id:s.diplomaIssuances.id,issuedAt:s.diplomaIssuances.issuedAt,revokedAt:s.diplomaIssuances.revokedAt,decision:s.graduationDecisions.decision,issuerId:s.graduationDecisions.issuingOrganizationId,studentId:s.graduationDecisions.studentProfileId}).from(s.diplomaIssuances).innerJoin(s.graduationDecisions,eq(s.graduationDecisions.id,s.diplomaIssuances.graduationDecisionId)).where(eq(s.diplomaIssuances.id,credentialId)).limit(1);
 if(!record||record.decision!=="approved"||record.revokedAt)throw new Error("No active diploma credential");
 const [student]=await db.select({first:s.people.legalFirstName,last:s.people.legalLastName}).from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId)).where(eq(s.studentProfiles.id,record.studentId)).limit(1);
 const [org]=await db.select({name:s.organizations.name}).from(s.organizations).where(eq(s.organizations.id,record.issuerId)).limit(1);
 return {studentProfileId:record.studentId,issuerId:record.issuerId,title:"DIPLOMA",issuer:org?.name??"",student:`${student?.first??""} ${student?.last??""}`,identifier:record.id,issuedAt:record.issuedAt.toISOString().slice(0,10),lines:["Has satisfied the institution's approved graduation requirements.","Issued by the school of record."]};
}
export const renderAcademicCredential=createServerFn({method:"GET"})
 .validator((value:unknown)=>target.parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))throw new AuthorizationError("credential issuer");
  if(data.kind==="transcript")await assertLatestTranscriptIssuance(db,s,doc.studentProfileId,doc.issuerId,data.credentialId);
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
  // External release may be created only from the independently signed
  // transfer workflow, never from caller-supplied reference text.
  if(data.kind!=="transcript"||data.releasePurpose!=="transfer")
   throw new AuthorizationError("Only verified school-transfer transcript releases are supported");
  const [student]=await db.select({personId:s.studentProfiles.personId})
   .from(s.studentProfiles).where(eq(s.studentProfiles.id,doc.studentProfileId)).limit(1);
  if(!student)throw new AuthorizationError("credential student");
  const [recipient]=await db.select({id:s.people.id,email:s.people.email,active:s.people.active})
   .from(s.people).where(eq(s.people.id,data.recipientPersonId)).limit(1);
  const [verified]=await db.select({id:s.accessAccounts.id}).from(s.accessAccounts)
   .innerJoin(s.accountPersonGrants,and(
    eq(s.accountPersonGrants.accountId,s.accessAccounts.id),
    eq(s.accountPersonGrants.personId,data.recipientPersonId),
    eq(s.accountPersonGrants.active,true),
    eq(s.accountPersonGrants.isSynthetic,false)))
   .where(and(eq(s.accessAccounts.disabled,false),
    isNotNull(s.accessAccounts.emailVerifiedAt),
    eq(s.accessAccounts.emailNormalized,data.recipientEmail.trim().toLowerCase())))
   .limit(1);
  const [relationship]=await db.select({id:s.guardianRelationships.id})
   .from(s.guardianRelationships).where(and(
    eq(s.guardianRelationships.studentPersonId,student.personId),
    eq(s.guardianRelationships.guardianPersonId,data.recipientPersonId),
    eq(s.guardianRelationships.canManageEnrollment,true))).limit(1);
  // Transfer consent must have been signed by the very same guardian and
  // linked to a completed institutional transfer action for this student.
  const [action]=await db.select().from(s.actions).where(and(
   eq(s.actions.id,data.instructionReference),
   eq(s.actions.type,"guardian_enrollment_change_request"),
   eq(s.actions.subjectType,"student_profile"),
   eq(s.actions.subjectId,doc.studentProfileId),
   eq(s.actions.status,"resolved"))).limit(1);
  const [consent]=await db.select().from(s.consentRecords).where(and(
   eq(s.consentRecords.id,data.consentEvidenceReference),
   eq(s.consentRecords.subjectType,"student_profile"),
   eq(s.consentRecords.subjectId,doc.studentProfileId),
   eq(s.consentRecords.consentType,"academic_records_transfer_release"),
   eq(s.consentRecords.signerPersonId,data.recipientPersonId),
   isNull(s.consentRecords.revokedAt))).limit(1);
  const [program]=action?.programId?await db.select({issuerId:s.programs.creditIssuingOrganizationId})
   .from(s.programs).where(eq(s.programs.id,action.programId)).limit(1):[];
  const evidence=consent?.signatureEvidence;
  // The existing school-transfer consent is destination-scoped. A guardian
  // inbox is a handoff to the signer, not authenticated delivery to the
  // destination institution; never represent it as institution receipt.
  const trustedInstructions=!!action&&action.metadata.kind==="transfer"&&
   action.metadata.exitCompletedByRegistrar===true&&
   action.metadata.recordsReleaseConsentId===consent?.id&&
   action.metadata.requestedByGuardianPersonId===data.recipientPersonId;
  const validAuthorityEvidence=!!consent&&evidence?.acknowledged===true&&
   evidence.actionId===action?.id&&
   evidence.guardianPersonId===data.recipientPersonId&&
   evidence.studentPersonId===student.personId&&
   evidence.destinationSchoolName===action?.metadata.destinationSchoolName&&
   evidence.programId===action?.programId;
  const approved=canAuthorizeAcademicCredentialRelease({
   issuerMatches:program?.issuerId===doc.issuerId,studentMatches:!!student,
   verifiedRecipient:!!recipient?.active&&
    recipient.email?.trim().toLowerCase()===data.recipientEmail.trim().toLowerCase()&&
    !!verified&&!!relationship,
   trustedInstructions,validAuthorityEvidence,
   registrarApproved:true,demoActor:!!context.demoFacilitator,
   purpose:"transfer",expiresAt:expiry,now:new Date(),
  });
  if(!approved)throw new AuthorizationError("Verified transfer, guardian consent and recipient identity required");
  return db.transaction(async tx=>{
   // Serialize competing requests for the same exact credential, recipient
   // and signed transfer. Repeated requests reuse the existing live grant.
   const lockKey=[data.credentialId,data.recipientPersonId,consent!.id].join(":");
   await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
   // Re-read and lock consent and action after obtaining the idempotency lock.
   // Authorization cannot race a revocation made before this transaction.
   const [liveConsent]=await tx.select().from(s.consentRecords)
    .where(eq(s.consentRecords.id,consent!.id)).for("share").limit(1);
   const [liveAction]=await tx.select().from(s.actions)
    .where(eq(s.actions.id,action!.id)).for("share").limit(1);
   const [liveGuardian]=await tx.select({id:s.guardianRelationships.id})
    .from(s.guardianRelationships).where(and(
     eq(s.guardianRelationships.studentPersonId,student.personId),
     eq(s.guardianRelationships.guardianPersonId,data.recipientPersonId),
     eq(s.guardianRelationships.canManageEnrollment,true))).for("share").limit(1);
   const [liveRecipientAccount]=await tx.select({id:s.accessAccounts.id})
    .from(s.accessAccounts)
    .innerJoin(s.accountPersonGrants,and(
     eq(s.accountPersonGrants.accountId,s.accessAccounts.id),
     eq(s.accountPersonGrants.personId,data.recipientPersonId),
     eq(s.accountPersonGrants.active,true),
     eq(s.accountPersonGrants.isSynthetic,false)))
    .where(and(eq(s.accessAccounts.disabled,false),
     isNotNull(s.accessAccounts.emailVerifiedAt),
     eq(s.accessAccounts.emailNormalized,data.recipientEmail.trim().toLowerCase())))
    .for("share").limit(1);
   if(!liveConsent||liveConsent.revokedAt||!liveGuardian||!liveRecipientAccount||
      liveConsent.signerPersonId!==data.recipientPersonId||
      liveConsent.subjectId!==doc.studentProfileId||
      liveAction?.subjectId!==doc.studentProfileId||
      liveAction?.metadata.requestedByGuardianPersonId!==data.recipientPersonId||
      liveAction?.status!=="resolved"||liveAction.metadata.exitCompletedByRegistrar!==true||
      liveAction.metadata.recordsReleaseConsentId!==liveConsent.id||
      liveConsent.signatureEvidence.actionId!==liveAction.id||
      liveConsent.signatureEvidence.acknowledged!==true||
      liveConsent.signatureEvidence.guardianPersonId!==data.recipientPersonId||
      liveConsent.signatureEvidence.studentPersonId!==student.personId||
      liveConsent.signatureEvidence.programId!==liveAction.programId||
      liveConsent.signatureEvidence.destinationSchoolName!==liveAction.metadata.destinationSchoolName)
    throw new AuthorizationError("Transfer release authority changed during review");
   const [existing]=await tx.select({
    id:s.academicCredentialReleaseAuthorizations.id,
   }).from(s.academicCredentialReleaseAuthorizations).where(and(
    eq(s.academicCredentialReleaseAuthorizations.issuingOrganizationId,doc.issuerId),
    eq(s.academicCredentialReleaseAuthorizations.transcriptIssuanceId,data.credentialId),
    eq(s.academicCredentialReleaseAuthorizations.recipientPersonId,data.recipientPersonId),
    eq(s.academicCredentialReleaseAuthorizations.recipientEmail,data.recipientEmail.trim().toLowerCase()),
    eq(s.academicCredentialReleaseAuthorizations.releasePurpose,"transfer"),
    eq(s.academicCredentialReleaseAuthorizations.instructionReference,action!.id),
    eq(s.academicCredentialReleaseAuthorizations.consentEvidenceReference,consent!.id),
    isNull(s.academicCredentialReleaseAuthorizations.revokedAt),
    gt(s.academicCredentialReleaseAuthorizations.expiresAt,new Date()),
   )).limit(1);
   if(existing)return {authorizationId:existing.id};
   // A signed consent is bound to this transfer action and recipient.
   const [created]=await tx.insert(s.academicCredentialReleaseAuthorizations).values({
    issuingOrganizationId:doc.issuerId,transcriptIssuanceId:data.credentialId,
    recipientPersonId:data.recipientPersonId,
    recipientEmail:data.recipientEmail.trim().toLowerCase(),
    releasePurpose:"transfer",instructionReference:action!.id,
    consentEvidenceReference:consent!.id,
    authorizedByPersonId:context.actorPersonId!,expiresAt:expiry,
   }).returning({id:s.academicCredentialReleaseAuthorizations.id});
   if(!created)throw new Error("Unable to record credential release");
   await writeAudit(tx,context,{
    action:"academic_credential.release.authorize",
    entityType:"academic_credential_release_authorization",entityId:created.id,
    scope:{organizationId:doc.issuerId},
    after:{recipientPersonId:data.recipientPersonId,credentialId:data.credentialId,
     consentId:consent!.id,transferActionId:action!.id,expiresAt:data.expiresAt},
   });
   return {authorizationId:created.id};
  });
 });


/** Conservative local freshness guard. The A-owned authoritative invalidation
 * adapter must replace this before release approval. A newer issuance makes
 * an older snapshot ineligible for transfer disclosure. */
async function assertLatestTranscriptIssuance(
 db:Awaited<ReturnType<typeof resources>>["db"],
 s:Awaited<ReturnType<typeof resources>>["s"],
 studentProfileId:string,issuerId:string,issuanceId:string,
){
 const [latest]=await db.select({id:s.transcriptIssuances.id})
  .from(s.transcriptIssuances)
  .where(and(eq(s.transcriptIssuances.studentProfileId,studentProfileId),
   eq(s.transcriptIssuances.issuingOrganizationId,issuerId)))
  .orderBy(desc(s.transcriptIssuances.issuedAt),desc(s.transcriptIssuances.id))
  .limit(1);
 if(!latest||latest.id!==issuanceId)
  throw new AuthorizationError("Superseded or missing official transcript issuance");
}

/** Verified account candidates are limited to the credential subject and
 * guardians with an existing academic-view relationship. This is NOT consent
 * for external disclosure. */
export const listVerifiedCredentialRecipients=createServerFn({method:"GET"})
 .validator((value:unknown)=>target.parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))
   throw new AuthorizationError("credential issuer");
  const [student]=await db.select({personId:s.studentProfiles.personId})
   .from(s.studentProfiles).where(eq(s.studentProfiles.id,doc.studentProfileId)).limit(1);
  if(!student)throw new AuthorizationError("credential student");
  const guardians=await db.select({personId:s.guardianRelationships.guardianPersonId})
   .from(s.guardianRelationships)
   .where(and(eq(s.guardianRelationships.studentPersonId,student.personId),
    eq(s.guardianRelationships.canViewAcademics,true)));
  const ids=[student.personId,...guardians.map(g=>g.personId)];
  return db.selectDistinct({
   personId:s.people.id,firstName:s.people.legalFirstName,
   lastName:s.people.legalLastName,email:s.accessAccounts.emailNormalized,
  }).from(s.people)
   .innerJoin(s.accountPersonGrants,and(
    eq(s.accountPersonGrants.personId,s.people.id),
    eq(s.accountPersonGrants.active,true),
    eq(s.accountPersonGrants.isSynthetic,false)))
   .innerJoin(s.accessAccounts,and(
    eq(s.accessAccounts.id,s.accountPersonGrants.accountId),
    eq(s.accessAccounts.disabled,false),
    isNotNull(s.accessAccounts.emailVerifiedAt)))
   .where(and(inArray(s.people.id,ids),eq(s.people.active,true),
    eq(s.people.email,s.accessAccounts.emailNormalized)))
   .orderBy(s.people.legalLastName,s.people.legalFirstName).limit(100);
 });

/** Issuer-scoped registrar release ledger, excluding private evidence contents. */
export const listAcademicCredentialReleaseAuthorizations=createServerFn({method:"GET"})
 .validator((value:unknown)=>target.parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const doc=await documentData(db,s,data.kind,data.credentialId);
  if(!context.scope.organizationIds?.includes(doc.issuerId))
   throw new AuthorizationError("credential issuer");
  return db.select({
   id:s.academicCredentialReleaseAuthorizations.id,
   recipientEmail:s.academicCredentialReleaseAuthorizations.recipientEmail,
   releasePurpose:s.academicCredentialReleaseAuthorizations.releasePurpose,
   authorizedAt:s.academicCredentialReleaseAuthorizations.authorizedAt,
   expiresAt:s.academicCredentialReleaseAuthorizations.expiresAt,
   revokedAt:s.academicCredentialReleaseAuthorizations.revokedAt,
  }).from(s.academicCredentialReleaseAuthorizations)
   .where(and(
    eq(s.academicCredentialReleaseAuthorizations.issuingOrganizationId,doc.issuerId),
    data.kind==="transcript"
     ?eq(s.academicCredentialReleaseAuthorizations.transcriptIssuanceId,data.credentialId)
     :eq(s.academicCredentialReleaseAuthorizations.diplomaIssuanceId,data.credentialId)))
   .orderBy(desc(s.academicCredentialReleaseAuthorizations.authorizedAt)).limit(100);
 });

/** Registrar-only disclosure history derived from committed audit records.
 * Provider acceptance and authorization creation are not evidence of access. */
export const listAcademicCredentialReleaseAccessHistory=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({authorizationId:uuid}).strict().parse(value))
 .handler(async ({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const context=await registrar();const {db,s}=await resources();
  const [release]=await db.select({issuerId:s.academicCredentialReleaseAuthorizations.issuingOrganizationId})
   .from(s.academicCredentialReleaseAuthorizations)
   .where(and(eq(s.academicCredentialReleaseAuthorizations.id,data.authorizationId),
    inArray(s.academicCredentialReleaseAuthorizations.issuingOrganizationId,context.scope.organizationIds??[]))).limit(1);
  if(!release)throw new AuthorizationError("issuer authorization");
  return db.select({id:s.auditEvents.id,occurredAt:s.auditEvents.occurredAt,
   actorPersonId:s.auditEvents.actorPersonId,action:s.auditEvents.action})
   .from(s.auditEvents).where(and(
    eq(s.auditEvents.resourceType,"academic_credential_release_authorization"),
    eq(s.auditEvents.resourceId,data.authorizationId),
    eq(s.auditEvents.action,"academic_credential.release.download")))
   .orderBy(desc(s.auditEvents.occurredAt)).limit(100);
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
  const recipientPersonId=context.actorPersonId;
  const {db,s}=await resources();
  return db.transaction(async tx=>{
  // Share a transaction lock with issuer revocations and read live authority
  // inside that protected disclosure transaction.
  const [release]=await tx.select().from(s.academicCredentialReleaseAuthorizations)
   .where(and(eq(s.academicCredentialReleaseAuthorizations.id,data.authorizationId),
    eq(s.academicCredentialReleaseAuthorizations.recipientPersonId,recipientPersonId)))
   .for("update").limit(1);
  if(!release||release.revokedAt||release.expiresAt<=new Date())
   throw new AuthorizationError("active recipient authorization");
  const [recipient]=await tx.select({email:s.people.email,active:s.people.active})
   .from(s.people).where(eq(s.people.id,recipientPersonId)).limit(1);
  if(!canDownloadAuthorizedCredential({actorPersonId:recipientPersonId,recipientPersonId:release.recipientPersonId,recipientEmail:release.recipientEmail,accountEmail:recipient?.email??null,recipientActive:recipient?.active??false,expiresAt:release.expiresAt,revokedAt:release.revokedAt,now:new Date(),demoFacilitator:!!context.demoFacilitator}))
   throw new AuthorizationError("recipient identity or release validity mismatch");
  if(!context.accountId||!context.sessionId||!context.grantId)throw new AuthorizationError("verified active recipient session");
  const [verifiedAccount]=await tx.select({id:s.accessAccounts.id})
   .from(s.accessAccounts)
   .innerJoin(s.accountPersonGrants,eq(s.accountPersonGrants.accountId,s.accessAccounts.id))
   .where(and(eq(s.accessAccounts.id,context.accountId),
    eq(s.accessAccounts.disabled,false),
    isNotNull(s.accessAccounts.emailVerifiedAt),
    eq(s.accessAccounts.emailNormalized,release.recipientEmail.trim().toLowerCase()),
    eq(s.accountPersonGrants.id,context.grantId),
    eq(s.accountPersonGrants.personId,recipientPersonId),
    eq(s.accountPersonGrants.active,true),
    eq(s.accountPersonGrants.isSynthetic,false)))
   .for("share").limit(1);
  if(!verifiedAccount)throw new AuthorizationError("verified recipient account required");
  // Recheck the live authorization immediately before generating the PDF.
  // Revocation or expiry between initial lookup and rendering must deny access.
  const [stillActive]=await tx.select({id:s.academicCredentialReleaseAuthorizations.id})
   .from(s.academicCredentialReleaseAuthorizations)
   .where(and(eq(s.academicCredentialReleaseAuthorizations.id,release.id),
    eq(s.academicCredentialReleaseAuthorizations.recipientPersonId,recipientPersonId),
    eq(s.academicCredentialReleaseAuthorizations.recipientEmail,release.recipientEmail),
    gt(s.academicCredentialReleaseAuthorizations.expiresAt,new Date()),
    isNull(s.academicCredentialReleaseAuthorizations.revokedAt)))
   .limit(1);
  if(!stillActive||release.expiresAt<=new Date())
   throw new AuthorizationError("release no longer active");
  const kind=release.transcriptIssuanceId?"transcript":"diploma";
  const credentialId=release.transcriptIssuanceId??release.diplomaIssuanceId;
  if(!credentialId)throw new AuthorizationError("credential release target");
  const doc=await documentData(tx as unknown as typeof db,s,kind,credentialId);
  // Agent A must supply a canonical supersession policy before broader release.
  // Transcript issuer/student identity is bound to the original signed transfer.
  const [currentIssuance]=await tx.select({
   id:s.transcriptIssuances.id,studentProfileId:s.transcriptIssuances.studentProfileId,
   issuerId:s.transcriptIssuances.issuingOrganizationId,
  }).from(s.transcriptIssuances)
   .where(eq(s.transcriptIssuances.id,credentialId)).for("share").limit(1);
  if(kind!=="transcript"||!currentIssuance||
     currentIssuance.studentProfileId!==doc.studentProfileId||
     currentIssuance.issuerId!==release.issuingOrganizationId)
   throw new AuthorizationError("Official transcript issuer or student invalid");

  if(doc.issuerId!==release.issuingOrganizationId)throw new AuthorizationError("credential issuer mismatch");
  await assertLatestTranscriptIssuance(tx as unknown as typeof db,s,doc.studentProfileId,doc.issuerId,credentialId);
  // Diploma delivery is blocked until Agent A defines active/superseded issuance semantics.
  // Historical transcript release remains bound to its exact immutable issuance snapshot.
  if(kind!=="transcript"||release.releasePurpose!=="transfer")
   throw new AuthorizationError("Only guardian transfer transcript access is supported");
  // The transfer action is not itself proof that a newer official transcript
  // is valid. Until Agent A supplies a supersession contract, this exact
  // issuance is the only credential eligible for this authorization.
  const [student]=await tx.select({personId:s.studentProfiles.personId})
   .from(s.studentProfiles).where(eq(s.studentProfiles.id,doc.studentProfileId)).limit(1);
  if(!student)throw new AuthorizationError("student identity");
  const [relationship]=await tx.select({id:s.guardianRelationships.id})
   .from(s.guardianRelationships).where(and(
    eq(s.guardianRelationships.studentPersonId,student.personId),
    eq(s.guardianRelationships.guardianPersonId,recipientPersonId),
    eq(s.guardianRelationships.canManageEnrollment,true))).for("share").limit(1);
  const [action]=await tx.select().from(s.actions).where(and(
   eq(s.actions.id,release.instructionReference),
   eq(s.actions.type,"guardian_enrollment_change_request"),
   eq(s.actions.subjectType,"student_profile"))).for("share").limit(1);
  const [consent]=await tx.select().from(s.consentRecords).where(and(
   eq(s.consentRecords.id,release.consentEvidenceReference),
   eq(s.consentRecords.subjectType,"student_profile"),
   eq(s.consentRecords.consentType,"academic_records_transfer_release"))).for("share").limit(1);
  const [program]=action?.programId?await tx.select({issuerId:s.programs.creditIssuingOrganizationId})
   .from(s.programs).where(eq(s.programs.id,action.programId)).limit(1):[];
  const evidence=consent?.signatureEvidence;
  if(!canRedeemTransferCredential({
   consentActive:!!consent&&!consent.revokedAt&&evidence?.acknowledged===true,
   consentMatchesStudent:consent?.subjectId===doc.studentProfileId&&
    evidence?.studentPersonId===student.personId,
   consentMatchesGuardian:consent?.signerPersonId===recipientPersonId&&
    evidence?.guardianPersonId===recipientPersonId,
   consentMatchesAction:evidence?.actionId===action?.id,
   consentMatchesDestination:typeof action?.metadata.destinationSchoolName==="string"&&
    evidence?.destinationSchoolName===action.metadata.destinationSchoolName,
   consentMatchesProgram:evidence?.programId===action?.programId,
   relationshipActive:!!relationship,
   actionResolved:action?.status==="resolved"&&action?.metadata.kind==="transfer",
   actionMatchesStudent:action?.subjectId===doc.studentProfileId,
   actionMatchesGuardian:action?.metadata.requestedByGuardianPersonId===recipientPersonId,
   actionMatchesConsent:action?.metadata.recordsReleaseConsentId===consent?.id,
   actionCompleted:action?.metadata.exitCompletedByRegistrar===true,
   issuerMatches:program?.issuerId===doc.issuerId,
  }))throw new AuthorizationError("Original transfer consent or guardian authority no longer valid");
  const pdf=academicDocumentPdf(doc);
  // Rendering may cross the expiry boundary; the row remains locked against
  // concurrent registrar revocation until the audited disclosure commits.
  if(release.expiresAt<=new Date())throw new AuthorizationError("release expired during PDF rendering");
  await writeAudit(tx,context,{action:"academic_credential.release.download",entityType:"academic_credential_release_authorization",entityId:release.id,scope:{organizationId:release.issuingOrganizationId},after:{recipientPersonId:recipientPersonId,credentialId}});
  return {filename:`${kind}-${credentialId}.pdf`,base64:Buffer.from(pdf).toString("base64")};
  });
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
