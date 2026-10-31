import {and,eq} from "drizzle-orm";
import {communicationThreads,domainEvents,programs,publicAdmissionsInterests,sites} from "@/db/schema";
import {AuthorizationError} from "@/domain/command-context";
import {isAcademicMarketingType} from "@/domain/academic-program-publication";
import {FAMILY_INVITATION_BATCH_KIND,familyInvitationBatchMetadataSchema} from "@/domain/family-invitations";
import {normalizeAccessEmail} from "@/domain/access-tokens";
import {EventTypes} from "@/domain/event-types";
import {requireChurchHostedOperatingServices} from "@/modules/programs/program-site-authorization.server";
import type {AccessEmailSender} from "@/modules/identity/resend-access-mail.server";
import {requestVerifiedFamilyStart,resolvePublishedFamilyStartDestination,type FamilyStartEmailOptions,type FamilyStartTransaction} from "./public-family-start.server";

type Reader=Pick<FamilyStartTransaction,"select">;

/** Private outreach needs current admissions authority and a usable canonical
 * family application, independently of marketing publication or public hosting. */
export async function resolvePrivateFamilyStartDestination(tx:Reader,programId:string){
 const [school]=await tx.select({
  programId:programs.id,programName:programs.name,siteId:sites.id,
  organizationId:sites.organizationId,programOrganizationId:programs.organizationId,
  slug:sites.slug,type:programs.type,status:programs.status,
 }).from(programs).innerJoin(sites,eq(sites.id,programs.siteId))
  .where(eq(programs.id,programId)).for("share",{of:[programs,sites]}).limit(1);
 if(!school||school.status!=="active"||!isAcademicMarketingType(school.type)||
  school.organizationId!==school.programOrganizationId)
  throw new Error("School applications not open");
 await requireChurchHostedOperatingServices(tx,programId,["admissions","school_of_record"]);
 return {programId:school.programId,programName:school.programName,siteId:school.siteId,
  organizationId:school.organizationId,slug:school.slug};
}

async function privateInvitation(tx:Reader,batchId:string,recipientKey:string){
 const [batch]=await tx.select({id:communicationThreads.id,contextId:communicationThreads.contextId,
  metadata:communicationThreads.metadata}).from(communicationThreads).where(and(
   eq(communicationThreads.id,batchId),eq(communicationThreads.contextType,"program"),
  )).for("share").limit(1);
 const parsed=familyInvitationBatchMetadataSchema.safeParse(batch?.metadata);
 if(!batch?.contextId||!parsed.success||parsed.data.kind!==FAMILY_INVITATION_BATCH_KIND||
  parsed.data.destination!=="private_platform") throw new AuthorizationError("authorized private family invitation");
 const recipient=parsed.data.recipients.find(row=>row.key===recipientKey);
 if(!recipient)throw new AuthorizationError("intended family invitation recipient");
 const school=await resolvePrivateFamilyStartDestination(tx,batch.contextId);
 if(school.siteId!==parsed.data.siteId)throw new AuthorizationError("original family invitation Site");
 return {school,recipient};
}

/** Staff outreach is not an adult's consent statement or guardian verification. */
export async function requestInvitedFamilyStart(batchId:string,recipientKey:string,
 sender:AccessEmailSender,options:FamilyStartEmailOptions={}){
 return requestVerifiedFamilyStart(async tx=>{
  const {school,recipient}=await privateInvitation(tx,batchId,recipientKey);
  return {school,contact:{programId:school.programId,email:normalizeAccessEmail(recipient.email),
   firstName:recipient.firstName||"Family",lastName:recipient.lastName||"Applicant"},
   evidence:{source:"staff_invitation",invitationBatchId:batchId,recipientKey}};
 },sender,options);
}

/**
 * A pre-opening family requested follow-up. Once admissions is authorized,
 * use the normal private verified-email application path without requiring
 * a published church website. No guardian identity is inferred.
 */
export async function requestConsentedInterestFamilyStart(
 interestId:string,sender:AccessEmailSender,options:FamilyStartEmailOptions={},
){
 return requestVerifiedFamilyStart(async tx=>{
  const [interest]=await tx.select({
   id:publicAdmissionsInterests.id,
   programId:publicAdmissionsInterests.programId,
   siteId:publicAdmissionsInterests.siteId,
   status:publicAdmissionsInterests.status,
   consentAt:publicAdmissionsInterests.contactConsentAt,
   firstName:publicAdmissionsInterests.contactFirstName,
   lastName:publicAdmissionsInterests.contactLastName,
   email:publicAdmissionsInterests.contactEmail,
  }).from(publicAdmissionsInterests).where(eq(publicAdmissionsInterests.id,interestId))
    .for("share").limit(1);
  if(!interest||!interest.consentAt||!["new","contacted"].includes(interest.status))
   throw new AuthorizationError("consented family interest");
  const school=await resolvePrivateFamilyStartDestination(tx,interest.programId);
  if(school.siteId!==interest.siteId)throw new AuthorizationError("original interest Site");
  return {school,contact:{
    programId:school.programId,firstName:interest.firstName,lastName:interest.lastName,
    email:normalizeAccessEmail(interest.email),
   },evidence:{source:"consented_interest" as const,interestId:interest.id}};
 },sender,options);
}

/** Only server-recorded issuance evidence selects the private path. A token or
 * client query parameter cannot bypass public publication requirements. */
export async function resolveRedeemedFamilyStartDestination(tx:Reader,
 intent:{id:string;programId:string;siteId:string;email:string}){
 const [event]=await tx.select({payload:domainEvents.payload}).from(domainEvents).where(and(
  eq(domainEvents.aggregateType,"public_family_start_request"),eq(domainEvents.aggregateId,intent.id),
  eq(domainEvents.eventType,EventTypes.PublicFamilyStartRequested),
 )).limit(1);
 if(event?.payload.source==="consented_interest"){
  const interestId=event.payload.interestId;
  if(typeof interestId!=="string")throw new AuthorizationError("consented family interest provenance");
  const [interest]=await tx.select({
   programId:publicAdmissionsInterests.programId,siteId:publicAdmissionsInterests.siteId,
   email:publicAdmissionsInterests.contactEmail,status:publicAdmissionsInterests.status,
   consentAt:publicAdmissionsInterests.contactConsentAt,
  }).from(publicAdmissionsInterests).where(eq(publicAdmissionsInterests.id,interestId)).limit(1);
  if(!interest||!interest.consentAt||interest.status==="closed"||
   interest.programId!==intent.programId||interest.siteId!==intent.siteId||
   normalizeAccessEmail(interest.email)!==intent.email)
   throw new AuthorizationError("original consented family interest destination");
  const school=await resolvePrivateFamilyStartDestination(tx,intent.programId);
  if(school.siteId!==interest.siteId)throw new AuthorizationError("original family interest Site");
  return school;
 }
 if(event?.payload.source!=="staff_invitation")return resolvePublishedFamilyStartDestination(tx,intent.programId);
 const {invitationBatchId,recipientKey}=event.payload;
 if(typeof invitationBatchId!=="string"||typeof recipientKey!=="string")
  throw new AuthorizationError("private family invitation provenance");
 const {school,recipient}=await privateInvitation(tx,invitationBatchId,recipientKey);
 if(school.programId!==intent.programId||school.siteId!==intent.siteId||
  normalizeAccessEmail(recipient.email)!==intent.email)
  throw new AuthorizationError("original private family invitation destination");
 return school;
}
