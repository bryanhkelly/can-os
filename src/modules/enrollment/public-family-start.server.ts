import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, programPublications, publicFamilyStartRequests, sitePublications, sites } from "@/db/schema";
import { hashAccessSecret, issueOpaqueSecret } from "@/domain/access-tokens";
import { publicFamilyStartInput, verifiedFamilyStartEmail, type PublicFamilyStartInput } from "@/domain/public-family-start";
import { assertPublishedFamilyInvitationDestination } from "@/domain/family-invitations";
import { isCurrentAcademicMarketingSnapshot } from "@/domain/academic-program-publication";
import { isPublicSiteSlug } from "@/domain/public-site-address";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { sendAccessLinkViaResend, type AccessEmailSender } from "@/modules/identity/resend-access-mail.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { DomainError } from "@/domain/errors";
const LIFETIME_MS=10*60*1000;
const COOLDOWN_MS=60*1000;
type Reader=Pick<typeof db,"select">;

export type PublishedFamilyStartDestination={
 siteId:string;organizationId:string;programId:string;programName:string;slug:string;
};
export type FamilyStartTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type FamilyStartPreparation = {
 school: Omit<PublishedFamilyStartDestination,"slug">;
 contact: {firstName:string;lastName:string;email:string;programId:string};
 evidence: {source:"published_site"|"staff_invitation"|"consented_interest";invitationBatchId?:string;recipientKey?:string;interestId?:string};
};

/** Resolve the same published, active, independently authorized application
 * destination for public requests and authorized outreach batches. */
export async function resolvePublishedFamilyStartDestination(
 tx:Reader,programId:string,slug?:string,
):Promise<PublishedFamilyStartDestination>{
 const [school]=await tx.select({
   siteId:sites.id,organizationId:sites.organizationId,programId:programs.id,
   programName:programs.name,slug:sitePublications.slug,
   programOrganizationId:programs.organizationId,programSiteId:programs.siteId,
   type:programs.type,status:programs.status,
   reviewedTitle:programPublications.title,reviewedSummary:programPublications.summary,
   reviewedGrades:programPublications.gradeRange,reviewedDelivery:programPublications.deliveryModel,
   currentName:programs.name,currentGrades:programs.gradeRange,
   currentDelivery:programs.deliveryModel,
 }).from(sitePublications)
   .innerJoin(sites,eq(sites.id,sitePublications.siteId))
   .innerJoin(programPublications,and(eq(programPublications.siteId,sites.id),
     eq(programPublications.programId,programId)))
   .innerJoin(programs,eq(programs.id,programPublications.programId))
   .where(and(eq(programs.id,programId),
     ...(slug?[eq(sitePublications.slug,slug)]:[]),
     eq(sitePublications.status,"published"),isNotNull(sitePublications.publishedAt),
     eq(programPublications.status,"published"),isNotNull(programPublications.publishedAt)))
   // Keep all three mutable admission facts stable until the caller's
   // transaction completes, including Program withdrawal or suspension.
   .for("share",{of:[sitePublications,programPublications,programs]}).limit(1);
 if(!school)throw new Error("School applications not open");
 assertPublishedFamilyInvitationDestination({
   type:school.type,status:school.status,programSiteId:school.programSiteId,
   programOrganizationId:school.programOrganizationId,
   siteOrganizationId:school.organizationId,publicationSiteId:school.siteId,
 });
 // A published snapshot can become stale after the institution edits a
 // Program. Keep the public Apply destination aligned with the same reviewed
 // facts required by the public academic catalog, including after link issue.
 if(!isCurrentAcademicMarketingSnapshot({
   title:school.reviewedTitle,summary:school.reviewedSummary,
   gradeRange:school.reviewedGrades,deliveryModel:school.reviewedDelivery,
   programName:school.currentName,canonicalGrades:school.currentGrades,
   canonicalDelivery:school.currentDelivery,
 }))throw new Error("School application details require renewed approval");
 // Public Apply must meet *both* the public listing authority and the
 // independent admissions authority. Neither marketing publication nor
 // an admissions-only agreement can establish a valid school listing.
 await requireChurchHostedOperatingServices(tx,programId,
   ["academic_instruction","school_of_record","admissions"]);
 return {siteId:school.siteId,organizationId:school.organizationId,
   programId:school.programId,programName:school.programName,slug:school.slug};
}

export type FamilyStartEmailOptions={
 idempotencyKey?:string;subject?:string;introduction?:string;
};

export async function requestPublicFamilyStart(
 slug:string,input:PublicFamilyStartInput,sender:AccessEmailSender=sendAccessLinkViaResend,
 options:FamilyStartEmailOptions={},
):Promise<{requestId:string;created:boolean}>{
 if(!isPublicSiteSlug(slug))throw new Error("Unknown school Site");
 const data=publicFamilyStartInput.parse(input);
 if(data.website.trim())return {requestId:data.requestId,created:false};
 return requestVerifiedFamilyStart(async tx=>({
  school:await resolvePublishedFamilyStartDestination(tx,data.programId,slug),
  contact:{...data,email:verifiedFamilyStartEmail(data)},evidence:{source:"published_site"},
 }),sender,options);
}

/** Shared email challenge, cooldown and evidence path for public and explicitly
 * authorized private invitations. The preparation runs in the same transaction. */
export async function requestVerifiedFamilyStart(
 prepare:(tx:FamilyStartTransaction)=>Promise<FamilyStartPreparation>,
 sender:AccessEmailSender=sendAccessLinkViaResend, options:FamilyStartEmailOptions={},
):Promise<{requestId:string;created:boolean}>{
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 const configuredOrigin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!pepper || pepper.length<32 || !configuredOrigin)throw new Error("Family email security unavailable");
 const origin=new URL(configuredOrigin);
 if(origin.protocol!=="https:" || origin.pathname!=="/" || origin.search || origin.hash)
  throw new Error("The family verification host must be a separate HTTPS platform origin");
 const token=issueOpaqueSecret(),tokenHash=hashAccessSecret(token,pepper);
 const outcome=await db.transaction(async tx=>{
  const {school,contact,evidence}=await prepare(tx);
  if(await isDemoTenantOrganization(school.organizationId,tx))
   throw new DomainError("FORBIDDEN","External family email verification is suppressed for demo schools");
  const email=contact.email;
  // Prevent parallel requests from multiplying messages to the same email.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email + ":" + school.programId}))`);
  const [recent]=await tx.select({id:publicFamilyStartRequests.id})
    .from(publicFamilyStartRequests).where(and(
      eq(publicFamilyStartRequests.programId,school.programId),
      eq(publicFamilyStartRequests.emailNormalized,email),
      gt(publicFamilyStartRequests.createdAt,new Date(Date.now()-COOLDOWN_MS)),
      gt(publicFamilyStartRequests.expiresAt,new Date()),
    )).limit(1);
  if(recent)return {requestId:recent.id,created:false,email};
  const [entry]=await tx.insert(publicFamilyStartRequests).values({
    siteId:school.siteId,programId:school.programId,emailNormalized:email,
    adultFirstName:contact.firstName,adultLastName:contact.lastName,
    tokenHash,expiresAt:new Date(Date.now()+LIFETIME_MS),
  }).returning({id:publicFamilyStartRequests.id});
  if(!entry)throw new Error("Unable to prepare family verification");
  // No child details or recipient email appear in event and audit payloads.
  await emitEvent(tx,{eventType:EventTypes.PublicFamilyStartRequested,
    aggregateType:"public_family_start_request",aggregateId:entry.id,
    siteId:school.siteId,organizationId:school.organizationId,programId:school.programId,
    payload:{status:"pending_email_verification",...evidence}});
  await writeAudit(tx,{action:"family.public_start.request",resourceType:"public_family_start_request",
    resourceId:entry.id,actorPersonId:null,
    scope:{siteId:school.siteId,programId:school.programId,organizationId:school.organizationId},
    after:{status:"pending_email_verification",...evidence},context:{anonymous:evidence.source==="published_site"}});
  return {requestId:entry.id,created:true,email};
 });
 if(!outcome.created)return {requestId:outcome.requestId,created:false};
 try {
 await sender({
  to:outcome.email,accessUrl:origin.origin+"/family/join#token="+encodeURIComponent(token),
  ...(options.idempotencyKey?{idempotencyKey:options.idempotencyKey}:{}),
  ...(options.subject?{subject:options.subject}:{}),
  ...(options.introduction?{introduction:options.introduction}:{}),
 });
 } catch (error) {
  await db.update(publicFamilyStartRequests).set({expiresAt:new Date(0)})
    .where(and(eq(publicFamilyStartRequests.id,outcome.requestId),
      eq(publicFamilyStartRequests.tokenHash,tokenHash)));
  throw error;
 }
 return {requestId:outcome.requestId,created:true};
}
