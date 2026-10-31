import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import * as s from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";

const kind="transfer_academic_records_handoff";
const uuid=z.string().uuid();
async function authorizedRegistrar(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="registrar"||!actor.actorPersonId||actor.demoFacilitator)
   throw new AuthorizationError("verified school records registrar");
 assertCapability(actor,"enrollment:manage");
 if(!actor.scope.organizationIds?.length||!actor.scope.siteIds?.length||
    !actor.scope.programIds?.length)
   throw new AuthorizationError("institutional records scope");
 return actor;
}

/** One registrar queue, backed by the original transfer Action and existing
 * transcript issuances. A record's issuance is not its delivery.
 */
export const listTransferRecordsHandoffs=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await authorizedRegistrar();
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
 .innerJoin(s.programs,eq(s.programs.id,s.actions.programId))
 .where(and(
   eq(s.actions.type,kind),eq(s.actions.subjectType,"student_profile"),
   inArray(s.actions.siteId,actor.scope.siteIds),
   inArray(s.actions.programId,actor.scope.programIds),
   inArray(s.actions.organizationId,actor.scope.organizationIds),
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
     inArray(s.transcriptIssuances.issuingOrganizationId,actor.scope.organizationIds),
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
