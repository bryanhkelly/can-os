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
import { emitEvent, notify, writeAudit } from "@/platform/mutation";

const kind="transfer_academic_records_handoff";
const uuid=z.string().uuid();
async function authorizedRegistrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.demoFacilitator)
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
   deliveryMethod:z.enum(["approved_secure_exchange","verified_secure_portal","physical_mail"]),
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
       if(handoff.metadata.issuedTranscriptId===data.issuanceId&&
          handoff.metadata.deliveryReceiptReference===data.receiptReference)
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
     const now=new Date();
     const evidence={
       issuedTranscriptId:issuance.id,
       deliveryMethod:data.deliveryMethod,
       deliveryReceiptReference:data.receiptReference,
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
         recordsIssuedTranscriptId:issuance.id,recordsReleasedAt:now.toISOString()},
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
