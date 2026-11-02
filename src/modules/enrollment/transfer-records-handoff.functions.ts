import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { listDelegatedCANTranscriptPrograms } from "@/modules/learning/can-transcript-scope.server";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { emitEvent, notify, notifyMany, writeAudit } from "@/platform/mutation";

const kind="transfer_academic_records_handoff";
const uuid=z.string().uuid();
async function authorizedRegistrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("verified school records registrar");
 assertCapability(actor,"enrollment:manage");
 if(!actor.scope.organizationIds?.length)
   throw new AuthorizationError("institutional records organization grant");
 return actor;
}

/** One registrar queue, backed by the original transfer Action and existing
 * transcript issuances. A record's issuance is not its delivery.
 */
export const listTransferRecordsHandoffs=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await authorizedRegistrar();
 const delegated=await listDelegatedCANTranscriptPrograms(actor,db);
 const delegatedIds=delegated.map(row=>row.programId);
 const rows=await db.select({
   id:s.actions.id,status:s.actions.status,title:s.actions.title,
   metadata:s.actions.metadata,createdAt:s.actions.createdAt,
   programId:s.actions.programId,studentProfileId:s.actions.subjectId,
   studentPersonId:s.studentProfiles.personId,
   studentFirstName:s.people.legalFirstName,studentLastName:s.people.legalLastName,
   creditIssuerId:s.programs.creditIssuingOrganizationId,
 }).from(s.actions)
 .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
 .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
 .innerJoin(s.programs,and(
   eq(s.programs.id,s.actions.programId),
   eq(s.programs.siteId,s.actions.siteId),
   eq(s.programs.organizationId,s.actions.organizationId),
 ))
 .where(and(
   eq(s.actions.type,kind),eq(s.actions.subjectType,"student_profile"),
   or(
     and(
       inArray(s.actions.siteId,actor.scope.siteIds??[]),
       inArray(s.actions.programId,actor.scope.programIds??[]),
       inArray(s.actions.organizationId,actor.scope.organizationIds??[]),
     ),
     inArray(s.actions.programId,delegatedIds),
   ),
   inArray(s.actions.status,["open","in_progress","waiting","resolved"]),
 )).orderBy(desc(s.actions.createdAt)).limit(100);
 if(!rows.length)return {items:[]};
 const originIds=rows.map(row=>row.metadata.originChangeActionId)
   .filter((id):id is string=>typeof id==="string");
 const linkedOrigins=originIds.length?await db.select({
   id:s.actions.id,metadata:s.actions.metadata,
 }).from(s.actions).where(and(
   eq(s.actions.type,"guardian_enrollment_change_request"),
   inArray(s.actions.id,originIds),
 )):[];
 const consents=rows.filter(row=>typeof row.metadata.recordsReleaseConsentId==="string")
   .map(row=>row.metadata.recordsReleaseConsentId as string);
 const [consentRows,issued]=await Promise.all([
   consents.length?db.select({
     id:s.consentRecords.id,revokedAt:s.consentRecords.revokedAt,
     signer:s.consentRecords.signerPersonId,subjectId:s.consentRecords.subjectId,
     evidence:s.consentRecords.signatureEvidence,consentType:s.consentRecords.consentType,
   }).from(s.consentRecords).where(inArray(s.consentRecords.id,consents)):Promise.resolve([]),
   db.select({
     id:s.transcriptIssuances.id,studentProfileId:s.transcriptIssuances.studentProfileId,
     issuerId:s.transcriptIssuances.issuingOrganizationId,
     issuedAt:s.transcriptIssuances.issuedAt,
   }).from(s.transcriptIssuances).where(and(
     inArray(s.transcriptIssuances.studentProfileId,rows.map(row=>row.studentProfileId)),
     inArray(s.transcriptIssuances.issuingOrganizationId,actor.scope.organizationIds??[]),
   )).orderBy(desc(s.transcriptIssuances.issuedAt)).limit(200),
 ]);
 return {items:rows.map(row=>{
   const origin=linkedOrigins.find(candidate=>candidate.id===row.metadata.originChangeActionId);
   const destinationApplicationId=origin?.metadata.destinationApplicationId;
   const internalReleaseAvailable=typeof destinationApplicationId==="string"&&
     typeof origin?.metadata.destinationProgramId==="string"&&
     typeof origin?.metadata.destinationRecordsReleaseConsentId==="string";
   const consent=consentRows.find(candidate=>candidate.id===row.metadata.recordsReleaseConsentId);
   const destination=typeof row.metadata.destinationSchoolName==="string"?row.metadata.destinationSchoolName:"";
   const consentRecorded=!!consent&&!consent.revokedAt&&
     consent.consentType==="academic_records_transfer_release"&&
     consent.subjectId===row.studentProfileId&&
     consent.signer===row.metadata.requestedByGuardianPersonId&&
     consent.evidence.destinationSchoolName===destination&&
     consent.evidence.acknowledged===true;
   return {
     id:row.id,status:row.status,title:row.title,
     studentName:row.studentFirstName+" "+row.studentLastName,
     studentPersonId:row.studentPersonId,
     destinationSchoolName:destination,
     destinationApplicationId:internalReleaseAvailable?destinationApplicationId:null,
     destinationContactEmail:typeof row.metadata.destinationSchoolContactEmail==="string"?
       row.metadata.destinationSchoolContactEmail:null,
     consentRecorded,createdAt:row.createdAt.toISOString(),
     issuances:issued.filter(item=>item.studentProfileId===row.studentProfileId&&
       item.issuerId===row.creditIssuerId).map(item=>({
         id:item.id,issuedAt:item.issuedAt.toISOString(),
       })),
     issuedTranscriptId:typeof row.metadata.issuedTranscriptId==="string"?
       row.metadata.issuedTranscriptId:null,
   };
 })};
});


/** Attest an externally completed secure transfer of an actual issued official
 * transcript. The app cannot claim the underlying physical/secure transport
 * was performed: the registrar supplies and owns delivery evidence.
 */
export const completeTransferRecordsHandoff=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
   handoffActionId:uuid,issuanceId:uuid,
   recipientSchoolName:z.string().trim().min(3).max(160),
   deliveryMethod:z.enum(["approved_secure_exchange","verified_secure_portal","physical_mail","can_internal_school_records"]),
   receiptReference:z.string().trim().min(12).max(400),
   confirmedRecipientVerified:z.literal(true),
   confirmedSecureDelivery:z.literal(true),
 }).strict().parse(input))
 .handler(async({data})=>{
   const actor=await authorizedRegistrar();
   return db.transaction(async tx=>{
     const delegated=await listDelegatedCANTranscriptPrograms(actor,tx);
     const [handoff]=await tx.select().from(s.actions)
       .where(and(eq(s.actions.id,data.handoffActionId),
         eq(s.actions.type,kind),eq(s.actions.subjectType,"student_profile")))
       .for("update").limit(1);
     if(!handoff?.programId||!handoff.siteId||!handoff.organizationId)
       throw new AuthorizationError("existing institutional transfer records handoff");
     const ownsOriginSchool=actor.scope.programIds?.includes(handoff.programId)&&
       actor.scope.siteIds?.includes(handoff.siteId)&&
       actor.scope.organizationIds?.includes(handoff.organizationId);
     const isDelegatedIssuer=delegated.some(program=>program.programId===handoff.programId&&
       program.siteId===handoff.siteId);
     if(!ownsOriginSchool&&!isDelegatedIssuer)
       throw new AuthorizationError("own school or exact CAN institutional record-issuer delegation");
     if(handoff.status==="resolved"){
       const requestedReceipt=data.deliveryMethod==="can_internal_school_records"?
         "CAN-RELEASE:"+handoff.id:data.receiptReference;
       if(handoff.metadata.issuedTranscriptId===data.issuanceId&&
          handoff.metadata.deliveryReceiptReference===requestedReceipt)
         return {completed:false as const,alreadyCompleted:true as const};
       throw new Error("This record handoff was previously completed");
     }
     if(handoff.status==="cancelled")throw new Error("The handoff is cancelled");
     const originId=handoff.metadata.originChangeActionId;
     if(typeof originId!=="string")throw new AuthorizationError("original transfer request");
     const [origin]=await tx.select().from(s.actions)
       .where(and(eq(s.actions.id,originId),
         eq(s.actions.type,"guardian_enrollment_change_request"),
         eq(s.actions.subjectId,handoff.subjectId)))
       .for("update").limit(1);
     if(!origin||origin.status!=="resolved"||
        origin.metadata.exitCompletedByRegistrar!==true||
        origin.metadata.kind!=="transfer"||
        origin.metadata.recordsHandoffActionId!==handoff.id)
       throw new AuthorizationError("completed origin-school transfer and records handoff linkage");
     const destination=handoff.metadata.destinationSchoolName;
     if(typeof destination!=="string"||destination.length<3||
        destination.trim().toLowerCase()!==data.recipientSchoolName.toLowerCase())
       throw new Error("The records recipient must be the same school named in the guardian's authorization");
     const guardianId=handoff.metadata.requestedByGuardianPersonId;
     const consentId=handoff.metadata.recordsReleaseConsentId;
     if(typeof guardianId!=="string"||typeof consentId!=="string")
       throw new Error("Verified parent records-release authorization is required before handoff");
     const [consent]=await tx.select().from(s.consentRecords)
       .where(and(eq(s.consentRecords.id,consentId),
         eq(s.consentRecords.subjectType,"student_profile"),
         eq(s.consentRecords.subjectId,handoff.subjectId),
         eq(s.consentRecords.consentType,"academic_records_transfer_release"),
         eq(s.consentRecords.signerPersonId,guardianId),
         isNull(s.consentRecords.revokedAt)))
       .limit(1);
     if(!consent||consent.signatureEvidence.acknowledged!==true||
        consent.signatureEvidence.actionId!==origin.id||
        consent.signatureEvidence.destinationSchoolName!==destination)
       throw new AuthorizationError("signed release consent for precisely this destination");
     const [student]=await tx.select({personId:s.studentProfiles.personId})
       .from(s.studentProfiles).where(eq(s.studentProfiles.id,handoff.subjectId)).limit(1);
     if(!student)throw new AuthorizationError("student academic record");
     const [relationship]=await tx.select({id:s.guardianRelationships.id})
       .from(s.guardianRelationships).where(guardianRelationshipPredicate({
         guardianPersonId:guardianId,studentPersonId:student.personId,access:"enrollment",
       })).limit(1);
     if(!relationship)throw new AuthorizationError("current verified guardian authority for records release");
     const [program]=await tx.select({
       id:s.programs.id,siteId:s.programs.siteId,
       organizationId:s.programs.organizationId,
       issuerId:s.programs.creditIssuingOrganizationId,
     }).from(s.programs).where(eq(s.programs.id,handoff.programId)).limit(1);
     if(!program||program.siteId!==handoff.siteId||
        program.organizationId!==handoff.organizationId||!program.issuerId||
        !actor.scope.organizationIds?.includes(program.issuerId))
       throw new AuthorizationError("authorized issuing organization and origin program");
     const [issuance]=await tx.select({
       id:s.transcriptIssuances.id,
     }).from(s.transcriptIssuances).where(and(
       eq(s.transcriptIssuances.id,data.issuanceId),
       eq(s.transcriptIssuances.studentProfileId,handoff.subjectId),
       eq(s.transcriptIssuances.issuingOrganizationId,program.issuerId),
     )).limit(1);
     if(!issuance)throw new AuthorizationError("officially issued transcript for this student and credit issuer");
     let internalDestination:{
       applicationId:string;programId:string;siteId:string;organizationId:string;consentId:string;
     }|null=null;
     if(data.deliveryMethod==="can_internal_school_records"){
       // A CAN internal handoff is a REAL scoped release of the existing
       // immutable issuance. It is not an assertion of external delivery.
       const applicationId=origin.metadata.destinationApplicationId;
       const receivingProgramId=origin.metadata.destinationProgramId;
       const consentId=origin.metadata.destinationRecordsReleaseConsentId;
       if(typeof applicationId!=="string"||
          typeof receivingProgramId!=="string"||
          typeof consentId!=="string")
         throw new AuthorizationError("receiving-school application and exact signed record release");
       const [receiving]=await tx.select({
         id:s.applications.id,programId:s.applications.programId,
         studentProfileId:s.applications.studentProfileId,
         submittedByPersonId:s.applications.submittedByPersonId,
         metadata:s.applications.metadata,siteId:s.programs.siteId,
         organizationId:s.programs.organizationId,status:s.programs.status,
       }).from(s.applications)
         .innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
         .where(eq(s.applications.id,applicationId)).limit(1);
       if(!receiving?.siteId||receiving.status!=="active"||
          receiving.siteId===handoff.siteId||
          receiving.studentProfileId!==handoff.subjectId||
          receiving.programId!==receivingProgramId||
          receiving.submittedByPersonId!==guardianId||
          receiving.metadata.originTransferActionId!==origin.id||
          receiving.metadata.destinationRecordsReleaseConsentId!==consentId)
         throw new AuthorizationError("verified receiving-school application for this student");
       const [approved]=await tx.select({
         evidence:s.consentRecords.signatureEvidence,
       }).from(s.consentRecords).where(and(
         eq(s.consentRecords.id,consentId),
         eq(s.consentRecords.subjectType,"application"),
         eq(s.consentRecords.subjectId,receiving.id),
         eq(s.consentRecords.consentType,"academic_records_destination_program_release"),
         eq(s.consentRecords.signerPersonId,guardianId),
         isNull(s.consentRecords.revokedAt),
       )).limit(1);
       if(!approved||approved.evidence.acknowledged!==true||
          approved.evidence.scope!=="official_transcript_only"||
          approved.evidence.originTransferActionId!==origin.id||
          approved.evidence.destinationApplicationId!==receiving.id||
          approved.evidence.destinationProgramId!==receiving.programId||
          approved.evidence.destinationSiteId!==receiving.siteId||
          approved.evidence.destinationOrganizationId!==receiving.organizationId||
          approved.evidence.studentProfileId!==receiving.studentProfileId||
          approved.evidence.guardianPersonId!==guardianId)
         throw new AuthorizationError("unrevoked parent consent for this exact CAN receiving school");
       await requireChurchHostedOperatingServices(tx,receiving.programId,["admissions","school_of_record"]);
       internalDestination={applicationId:receiving.id,programId:receiving.programId,
         siteId:receiving.siteId,organizationId:receiving.organizationId,consentId};
     }
     const now=new Date();
     const evidence={
       issuedTranscriptId:issuance.id,
       deliveryMethod:data.deliveryMethod,
       deliveryReceiptReference:internalDestination?"CAN-RELEASE:"+handoff.id:data.receiptReference,
       ...(internalDestination?{
         destinationApplicationId:internalDestination.applicationId,
         destinationProgramId:internalDestination.programId,
         destinationSiteId:internalDestination.siteId,
         destinationRecordsReleaseConsentId:internalDestination.consentId,
         deliveredInCAN:true,
       }:{}),
       recipientSchoolName:destination,
       recipientVerifiedByPersonId:actor.actorPersonId,
       completedByPersonId:actor.actorPersonId,
       completedAt:now.toISOString(),
     };
     const [closed]=await tx.update(s.actions).set({
       status:"resolved",resolvedAt:now,updatedAt:now,
       resolutionNote:"Registrar attested official transcript transfer to the verified destination; secure delivery evidence is on record.",
       metadata:{...handoff.metadata,...evidence,status:"completed"},
     }).where(and(eq(s.actions.id,handoff.id),
       inArray(s.actions.status,["open","in_progress","waiting"])))
       .returning({id:s.actions.id});
     if(!closed)throw new Error("The records handoff was already completed");
     await tx.update(s.actions).set({
       metadata:{...origin.metadata,recordsHandoffStatus:"completed",
         recordsHandoffActionId:handoff.id,
         recordsIssuedTranscriptId:issuance.id,
         recordsReleasedInternally:internalDestination!==null,
         recordsReleasedAt:now.toISOString()},
       updatedAt:now,
     }).where(eq(s.actions.id,origin.id));
     await writeAudit(tx,actor,{
       action:"transfer.academic_records.handoff_attested",
       entityType:"action",entityId:handoff.id,
       scope:{organizationId:handoff.organizationId,siteId:handoff.siteId,programId:handoff.programId},
       after:evidence,
     });
     await emitEvent(tx,{
       eventType:EventTypes.ActionResolved,aggregateType:"action",aggregateId:handoff.id,
       actorPersonId:actor.actorPersonId,
       payload:{subjectType:"student_profile",subjectId:handoff.subjectId,
         transcriptIssuanceId:issuance.id},
     });
     if(internalDestination){
       const receivingRegistrars=await tx.selectDistinct({
         personId:s.accountPersonGrants.personId,
       }).from(s.accountPersonGrants)
         .innerJoin(s.people,and(eq(s.people.id,s.accountPersonGrants.personId),
           eq(s.people.active,true)))
         .innerJoin(s.accessAccounts,and(
           eq(s.accessAccounts.id,s.accountPersonGrants.accountId),
           eq(s.accessAccounts.disabled,false),
         ))
         .where(and(
           eq(s.accountPersonGrants.role,"registrar"),
           eq(s.accountPersonGrants.active,true),
           eq(s.accountPersonGrants.organizationId,internalDestination.organizationId),
           or(isNull(s.accountPersonGrants.siteId),
             eq(s.accountPersonGrants.siteId,internalDestination.siteId)),
         ));
       await notifyMany(tx,receivingRegistrars.map(registrar=>({
         recipientPersonId:registrar.personId,
         type:"transfer_destination_transcript_ready",
         title:"Authorized transfer transcript ready for admissions review",
         body:"An officially issued transcript has been released to your school for a linked application.",
         resourceType:"application",resourceId:internalDestination!.applicationId,
       })));
     }
     await notify(tx,{
       recipientPersonId:guardianId,
       type:"guardian_enrollment_change_updated",
       title:"School reports transfer records released",
       body:"The records office recorded a verified destination handoff for the official transcript. See your transfer request for status.",
       resourceType:"action",resourceId:origin.id,
     });
     return {completed:true as const,issuanceId:issuance.id};
   });
 });


/** An exact receiving-school registrar may view only the OFFICIAL transcript
 * already issued and recorded as released for this verified transfer. This
 * never exposes the originating school's editable grades, medical records,
 * custody information, or unrelated students.
 */
export const getReceivingSchoolTransferTranscript=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({applicationId:uuid}).strict().parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  if(actor.role!=="registrar"||!actor.actorPersonId||actor.sessionAccountId)
   throw new AuthorizationError("real destination-school registrar");
  assertCapability(actor,"admissions:read");
  return db.transaction(async tx=>{
   const [app]=await tx.select({
     id:s.applications.id,programId:s.applications.programId,
     studentProfileId:s.applications.studentProfileId,
     submittedByPersonId:s.applications.submittedByPersonId,
     metadata:s.applications.metadata,
     siteId:s.programs.siteId,organizationId:s.programs.organizationId,
     programName:s.programs.name,siteName:s.sites.name,
   }).from(s.applications)
     .innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
     .innerJoin(s.sites,eq(s.sites.id,s.programs.siteId))
     .where(eq(s.applications.id,data.applicationId)).limit(1);
   if(!app?.siteId||!app.submittedByPersonId||
      !actor.scope.organizationIds?.includes(app.organizationId)||
      !actor.scope.siteIds?.includes(app.siteId)||
      !actor.scope.programIds?.includes(app.programId))
    throw new AuthorizationError("specific receiving-school application scope");
   const originId=app.metadata.originTransferActionId;
   const releaseId=app.metadata.destinationRecordsReleaseConsentId;
   if(typeof originId!=="string"||typeof releaseId!=="string")
    throw new AuthorizationError("application requires an explicit destination-school transcript release");
   const [origin]=await tx.select({
     id:s.actions.id,status:s.actions.status,type:s.actions.type,
     subjectId:s.actions.subjectId,programId:s.actions.programId,
     metadata:s.actions.metadata,
   }).from(s.actions).where(eq(s.actions.id,originId)).limit(1);
   if(!origin||origin.type!=="guardian_enrollment_change_request"||
      origin.subjectId!==app.studentProfileId||
      !origin.programId||origin.programId===app.programId||
      origin.status!=="resolved"||
      origin.metadata.kind!=="transfer"||
      origin.metadata.exitCompletedByRegistrar!==true||
      origin.metadata.exitStatus!=="transferred"||
      origin.metadata.recordsHandoffStatus!=="completed"||
      origin.metadata.destinationApplicationId!==app.id||
      origin.metadata.destinationProgramId!==app.programId||
      origin.metadata.requestedByGuardianPersonId!==app.submittedByPersonId||
      origin.metadata.destinationRecordsReleaseConsentId!==releaseId)
    throw new AuthorizationError("completed origin-school transfer with exact destination linkage");
   const [consent]=await tx.select({
     id:s.consentRecords.id,revokedAt:s.consentRecords.revokedAt,
     evidence:s.consentRecords.signatureEvidence,
   }).from(s.consentRecords).where(and(
     eq(s.consentRecords.id,releaseId),
     eq(s.consentRecords.subjectType,"application"),
     eq(s.consentRecords.subjectId,app.id),
     eq(s.consentRecords.consentType,"academic_records_destination_program_release"),
     eq(s.consentRecords.signerPersonId,app.submittedByPersonId),
     isNull(s.consentRecords.revokedAt),
   )).limit(1);
   if(!consent||consent.evidence.acknowledged!==true||
      consent.evidence.scope!=="official_transcript_only"||
      consent.evidence.originTransferActionId!==origin.id||
      consent.evidence.destinationApplicationId!==app.id||
      consent.evidence.destinationProgramId!==app.programId||
      consent.evidence.destinationSiteId!==app.siteId||
      consent.evidence.destinationOrganizationId!==app.organizationId||
      consent.evidence.studentProfileId!==app.studentProfileId||
      consent.evidence.guardianPersonId!==app.submittedByPersonId)
    throw new AuthorizationError("current signed guardian release to this exact receiving-school Program");
   const handoffId=origin.metadata.recordsHandoffActionId;
   const issuanceId=origin.metadata.recordsIssuedTranscriptId;
   if(typeof handoffId!=="string"||typeof issuanceId!=="string")
    throw new AuthorizationError("verified originating-school transcript handoff");
   const [handoff]=await tx.select({
     id:s.actions.id,status:s.actions.status,
     metadata:s.actions.metadata,
   }).from(s.actions).where(and(
     eq(s.actions.id,handoffId),
     eq(s.actions.type,"transfer_academic_records_handoff"),
     eq(s.actions.subjectType,"student_profile"),
     eq(s.actions.subjectId,app.studentProfileId),
   )).limit(1);
   // An externally attested mailing/portal handoff is NOT a CAN-internal
   // release. Only the exact Program-bound electronic release made by the
   // origin registrar grants the receiving school in-app transcript access.
   if(!handoff||handoff.status!=="resolved"||
      handoff.metadata.originChangeActionId!==origin.id||
      handoff.metadata.issuedTranscriptId!==issuanceId||
      handoff.metadata.deliveredInCAN!==true||
      handoff.metadata.deliveryMethod!=="can_internal_school_records"||
      handoff.metadata.deliveryReceiptReference!=="CAN-RELEASE:"+handoff.id||
      handoff.metadata.destinationApplicationId!==app.id||
      handoff.metadata.destinationProgramId!==app.programId||
      handoff.metadata.destinationSiteId!==app.siteId||
      handoff.metadata.destinationRecordsReleaseConsentId!==releaseId)
    throw new AuthorizationError("verified CAN-internal official transcript release to this application");
   const [record]=await tx.select({
     id:s.transcriptIssuances.id,studentProfileId:s.transcriptIssuances.studentProfileId,
     issuingOrganizationId:s.transcriptIssuances.issuingOrganizationId,
     issuedAt:s.transcriptIssuances.issuedAt,
     snapshot:s.transcriptIssuances.snapshot,
     originCreditIssuer:s.programs.creditIssuingOrganizationId,
   }).from(s.transcriptIssuances)
     .innerJoin(s.programs,eq(s.programs.id,origin.programId))
     .where(eq(s.transcriptIssuances.id,issuanceId)).limit(1);
   if(!record||record.studentProfileId!==app.studentProfileId||
      record.issuingOrganizationId!==record.originCreditIssuer)
    throw new AuthorizationError("exact official student transcript and source credit issuer");
   const rows=Array.isArray(record.snapshot.rows)?record.snapshot.rows:[];
   const formatted=rows.filter((row):row is Record<string,unknown>=>
     !!row&&typeof row==="object"&&!Array.isArray(row)).map(row=>({
       course:typeof row.sectionTitle==="string"?row.sectionTitle:"Course",
       term:typeof row.termName==="string"?row.termName:"",
       schoolYear:typeof row.schoolYearName==="string"?row.schoolYearName:"",
       grade:typeof row.letterGrade==="string"?row.letterGrade:"Not recorded",
       creditsAttempted:typeof row.creditsAttempted==="number"?row.creditsAttempted:null,
       creditsEarned:typeof row.creditsEarned==="number"?row.creditsEarned:null,
       creditIssuer:typeof row.creditIssuingOrganization==="string"?row.creditIssuingOrganization:"",
     }));
   await writeAudit(tx,actor,{
     action:"transfer.destination_official_transcript.viewed",
     entityType:"transcript_issuance",entityId:record.id,
     scope:{organizationId:app.organizationId,siteId:app.siteId,programId:app.programId},
     after:{applicationId:app.id,originTransferActionId:origin.id,
       consentId:consent.id,issuedTranscriptId:record.id},
   });
   return {applicationId:app.id,programName:app.programName,siteName:app.siteName,
     issuanceId:record.id,issuedAt:record.issuedAt.toISOString(),rows:formatted};
  });
 });
