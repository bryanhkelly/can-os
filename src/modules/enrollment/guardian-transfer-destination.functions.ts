import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {and,asc,eq,isNotNull,or} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import * as s from "@/db/schema";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {guardianRelationshipPredicate} from "@/domain/guardian-relationship";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {requestPublicFamilyStart,resolvePublishedFamilyStartDestination} from "./public-family-start.server";
import {writeAudit} from "@/platform/mutation";

const uuid=z.string().uuid();
async function verifiedFamily(){
 const actor=await getCommandContext(getRequest());
 if(actor.role!=="guardian"||!actor.actorPersonId||actor.demoFacilitator)
  throw new AuthorizationError("verified family account");
 assertCapability(actor,"enrollment.apply");
 const [account]=await db.select({
  email:s.accessAccounts.emailNormalized,
  verifiedAt:s.accessAccounts.emailVerifiedAt,
  disabled:s.accessAccounts.disabled,
 }).from(s.accessAccounts).where(eq(s.accessAccounts.id,actor.accountId)).limit(1);
 if(!account||account.disabled||!account.verifiedAt)
  throw new AuthorizationError("verified family email");
 return {actor,email:account.email};
}

/** Only publicly published academic destinations may be discovered by a
 * family not yet granted the receiving school's Program or Site. */
export const listPublicTransferDestinations=createServerFn({method:"GET"}).handler(async()=>{
 setResponseHeader("Cache-Control","private, no-store");
 await verifiedFamily();
 const rows=await db.selectDistinct({
  id:s.programs.id,name:s.programs.name,
  siteName:s.sites.name,slug:s.sitePublications.slug,
 }).from(s.programs)
 .innerJoin(s.sites,eq(s.sites.id,s.programs.siteId))
 .innerJoin(s.sitePublications,and(
  eq(s.sitePublications.siteId,s.sites.id),
  eq(s.sitePublications.status,"published"),
  isNotNull(s.sitePublications.publishedAt),
 ))
 .innerJoin(s.programPublications,and(
  eq(s.programPublications.programId,s.programs.id),
  eq(s.programPublications.siteId,s.sites.id),
  eq(s.programPublications.status,"published"),
  isNotNull(s.programPublications.publishedAt),
 ))
 .innerJoin(s.admissionSeatPools,eq(s.admissionSeatPools.programId,s.programs.id))
 .innerJoin(s.schoolYears,and(
  eq(s.schoolYears.id,s.admissionSeatPools.schoolYearId),
  eq(s.schoolYears.status,"active"),
  eq(s.schoolYears.organizationId,s.programs.organizationId),
  eq(s.schoolYears.siteId,s.sites.id),
  or(eq(s.schoolYears.programId,s.programs.id),
   eq(s.schoolYears.programId,s.programs.id)),
 ))
 .where(and(eq(s.programs.status,"active"),
  eq(s.programs.organizationId,s.sites.organizationId)))
 .orderBy(asc(s.sites.name),asc(s.programs.name)).limit(100);
 return rows;
});

const request=z.object({
 originTransferActionId:uuid,destinationProgramId:uuid,
 requestId:uuid,confirmedDestination:z.literal(true),
}).strict();

/** Parent-requested verified-email sign-in to a receiving school. The school
 * cannot see the child's record merely because the adult receives a link.
 * Token redemption uses the canonical public-family-start gate and reuses
 * the existing verified account Person rather than fabricating a new child. */
export const requestTransferDestinationFamilyStart=createServerFn({method:"POST"})
 .validator((data:unknown)=>request.parse(data))
 .handler(async({data})=>{
  const {actor,email}=await verifiedFamily();
  const [origin]=await db.select({
   id:s.actions.id,status:s.actions.status,
   metadata:s.actions.metadata,studentProfileId:s.actions.subjectId,
   studentPersonId:s.studentProfiles.personId,
  }).from(s.actions)
   .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.actions.subjectId))
   .innerJoin(s.guardianRelationships,guardianRelationshipPredicate({
    guardianPersonId:actor.actorPersonId!,
    studentPersonId:s.studentProfiles.personId,access:"enrollment",
   }))
   .where(and(eq(s.actions.id,data.originTransferActionId),
    eq(s.actions.type,"guardian_enrollment_change_request"),
    eq(s.actions.subjectType,"student_profile"))).limit(1);
  if(!origin||origin.metadata.kind!=="transfer"||
     origin.metadata.requestedByGuardianPersonId!==actor.actorPersonId||
     origin.status==="cancelled"||
     typeof origin.metadata.recordsReleaseConsentId!=="string")
   throw new AuthorizationError("your existing verified transfer request");
  const [guardian]=await db.select({
   firstName:s.people.legalFirstName,lastName:s.people.legalLastName,
  }).from(s.people).where(and(eq(s.people.id,actor.actorPersonId!),eq(s.people.active,true))).limit(1);
  if(!guardian)throw new AuthorizationError("current adult family record");
  // A separate publication/academic-authorization check occurs again in the
  // canonical start transaction when the email token is issued.
  const destination=await resolvePublishedFamilyStartDestination(db,data.destinationProgramId);
  if(origin.metadata.destinationProgramId===destination.programId)
   throw new Error("This receiving-school application is already linked; continue the existing application.");
  if(origin.metadata.originProgramId===destination.programId)
   throw new Error("Choose a different school from the originating school.");
  const result=await requestPublicFamilyStart(destination.slug,{
   requestId:data.requestId,
   programId:destination.programId,
   firstName:guardian.firstName,lastName:guardian.lastName,
   email,contactConsent:"yes",website:"",
  });
  await writeAudit(db,actor,{
   action:"transfer.destination_family_start_requested",
   entityType:"action",entityId:origin.id,
   scope:{programId:destination.programId,siteId:destination.siteId,
     organizationId:destination.organizationId},
   after:{destinationProgramId:destination.programId,
     verificationRequested:result.created,
     familyStartRequestId:result.requestId},
  });
  return {requested:result.created,destinationName:destination.programName};
 });
