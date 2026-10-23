import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { programs, programPublications, publicFamilyStartRequests, sitePublications, sites } from "@/db/schema";
import { hashAccessSecret, issueOpaqueSecret } from "@/domain/access-tokens";
import { publicFamilyStartInput, verifiedFamilyStartEmail, type PublicFamilyStartInput } from "@/domain/public-family-start";
import { publishableAcademicProgram } from "@/domain/academic-program-publication";
import { isPublicSiteSlug } from "@/domain/public-site-address";
import { requireChurchHostedOperatingServices } from "@/modules/programs/program-site-authorization.server";
import { sendAccessLinkViaResend, type AccessEmailSender } from "@/modules/identity/resend-access-mail.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

const LIFETIME_MS=10*60*1000;
const COOLDOWN_MS=60*1000;

export async function requestPublicFamilyStart(
 slug:string, input:PublicFamilyStartInput, sender:AccessEmailSender=sendAccessLinkViaResend,
):Promise<void>{
 if(!isPublicSiteSlug(slug))throw new Error("Unknown school Site");
 const data=publicFamilyStartInput.parse(input);
 if(data.website.trim())return;
 const email=verifiedFamilyStartEmail(data);
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 const configuredOrigin=process.env.CAN_ACCESS_PUBLIC_ORIGIN;
 if(!pepper || pepper.length<32 || !configuredOrigin)throw new Error("Family email security unavailable");
 const origin=new URL(configuredOrigin);
 if(origin.protocol!=="https:" || origin.pathname!=="/" || origin.search || origin.hash)
  throw new Error("The family verification host must be a separate HTTPS platform origin");
 const token=issueOpaqueSecret(),tokenHash=hashAccessSecret(token,pepper);
 const created=await db.transaction(async tx=>{
  const [school]=await tx.select({
    siteId:sites.id,organizationId:sites.organizationId,programId:programs.id,
    programOrganizationId:programs.organizationId,programSiteId:programs.siteId,
    type:programs.type,status:programs.status,
  }).from(sitePublications)
    .innerJoin(sites,eq(sites.id,sitePublications.siteId))
    .innerJoin(programPublications,and(eq(programPublications.siteId,sites.id),
      eq(programPublications.programId,data.programId)))
    .innerJoin(programs,eq(programs.id,programPublications.programId))
    .where(and(eq(sitePublications.slug,slug),
      eq(sitePublications.status,"published"),isNotNull(sitePublications.publishedAt),
      eq(programPublications.status,"published"),isNotNull(programPublications.publishedAt)))
    .for("share",{of:sitePublications}).limit(1);
  if(!school||school.status!=="active"||!publishableAcademicProgram({
    type:school.type,status:school.status,siteId:school.programSiteId,
    organizationId:school.programOrganizationId,
    siteOrganizationId:school.organizationId,publicationSiteId:school.siteId,
  }))throw new Error("School applications not open");
  // Marketing publication alone is not operating/registration authority.
  await requireChurchHostedOperatingServices(tx,data.programId,["admissions","school_of_record"]);
  // Prevent parallel bot requests from multiplying messages to the same email.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${email + ":" + data.programId}))`);
  const [recent]=await tx.select({id:publicFamilyStartRequests.id})
    .from(publicFamilyStartRequests).where(and(
      eq(publicFamilyStartRequests.programId,data.programId),
      eq(publicFamilyStartRequests.emailNormalized,email),
      gt(publicFamilyStartRequests.createdAt,new Date(Date.now()-COOLDOWN_MS)),
    )).limit(1);
  if(recent)return false;
  const [entry]=await tx.insert(publicFamilyStartRequests).values({
    siteId:school.siteId,programId:data.programId,emailNormalized:email,
    adultFirstName:data.firstName,adultLastName:data.lastName,
    tokenHash,expiresAt:new Date(Date.now()+LIFETIME_MS),
  }).returning({id:publicFamilyStartRequests.id});
  if(!entry)throw new Error("Unable to prepare family verification");
  // No child details or public email appear in event and audit payloads.
  await emitEvent(tx,{eventType:"PublicFamilyStartRequested",
    aggregateType:"public_family_start_request",aggregateId:entry.id,
    siteId:school.siteId,organizationId:school.organizationId,programId:school.programId,
    payload:{status:"pending_email_verification"}});
  await writeAudit(tx,{action:"family.public_start.request",resourceType:"public_family_start_request",
    resourceId:entry.id,actorPersonId:null,
    scope:{siteId:school.siteId,programId:school.programId,organizationId:school.organizationId},
    after:{status:"pending_email_verification"},context:{anonymous:true}});
  return true;
 });
 if(!created)return;
 await sender({to:email,accessUrl:origin.origin+"/family/join#token="+encodeURIComponent(token)});
}
