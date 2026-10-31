import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {programs,curriculumEntitlements,curriculumPackVersions} from "@/db/schema";
import {curriculumAnnualAdoptions} from "@/db/schema/curriculum-year-adoptions";
import {AuthorizationError} from "@/domain/command-context";
import {hasInstitutionalProgramCapability} from "@/modules/identity/institutional-capability.server";
import type {Actor} from "@/modules/identity/actors.server";
import {writeAudit,emitEvent} from "@/platform/mutation";
import {annualAdoptionEligible} from "@/domain/curriculum-year-policy";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Year={id:string;startsAt:Date;endsAt:Date};
/** Caller must resolve the canonical academic year server-side; never infer it from a previous adoption. */
export async function readAnnualAdoptionEligibility(actor:Actor, input:{
 programId:string;year:Year;packId:string;now?:Date;
}, executor:Pick<Tx,"select">=db){
 const [program]=await executor.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
 if(!program || !await hasInstitutionalProgramCapability(actor,program,"curriculum.adopt",executor))
  throw new AuthorizationError("institutional curriculum adoption grant and program scope");
 const [adoption]=await executor.select().from(curriculumAnnualAdoptions).where(and(
  eq(curriculumAnnualAdoptions.programId,program.id),eq(curriculumAnnualAdoptions.academicYearId,input.year.id),
  eq(curriculumAnnualAdoptions.packId,input.packId))).limit(1);
 if(!adoption)return {eligible:false,reason:"no_year_adoption" as const};
 const [license]=await executor.select().from(curriculumEntitlements).where(and(
  eq(curriculumEntitlements.id,adoption.entitlementId),eq(curriculumEntitlements.organizationId,program.organizationId),
  eq(curriculumEntitlements.packId,input.packId))).limit(1);
 const [version]=await executor.select().from(curriculumPackVersions).where(and(
  eq(curriculumPackVersions.id,adoption.packVersionId),eq(curriculumPackVersions.packId,input.packId))).limit(1);
 const metadata=license?.metadata??{};
 const date=(v:unknown)=>typeof v==="string"&&!Number.isNaN(Date.parse(v))?new Date(v):null;
 const eligible=!!license&&annualAdoptionEligible({
  scope:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
   academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id},
  adoption,license:{organizationId:license.organizationId,packId:license.packId,
   publisherOrganizationId:"",status:license.status,startsAt:date(metadata.licenseStartsAt),
   endsAt:date(metadata.licenseEndsAt),withdrawnAt:date(metadata.withdrawnAt)},
  year:input.year,now:input.now??new Date(),packVersionPublished:version?.status==="published",
 });
 return {eligible,reason:eligible?"active" as const:"invalid_or_expired" as const,versionId:adoption.packVersionId};
}
/** Explicit rollover, one annual record per Program/year/pack. Existing sections are not touched. */
export async function rolloverCurriculumAdoption(actor:Actor,input:{
 programId:string;year:Year;packId:string;versionId:string;now?:Date;
}){
 return db.transaction(async tx=>{
  const [program]=await tx.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
  if(!program||!await hasInstitutionalProgramCapability(actor,program,"curriculum.adopt",tx))
   throw new AuthorizationError("institutional curriculum adoption grant and program scope");
  const [entitlement]=await tx.select().from(curriculumEntitlements).where(and(
   eq(curriculumEntitlements.organizationId,program.organizationId),eq(curriculumEntitlements.packId,input.packId))).limit(1);
  const [version]=await tx.select().from(curriculumPackVersions).where(and(
   eq(curriculumPackVersions.id,input.versionId),eq(curriculumPackVersions.packId,input.packId),
   eq(curriculumPackVersions.status,"published"))).limit(1);
  if(!entitlement||!version)throw new AuthorizationError("licensed published curriculum release");
  const [existing]=await tx.select().from(curriculumAnnualAdoptions).where(and(
   eq(curriculumAnnualAdoptions.programId,program.id),eq(curriculumAnnualAdoptions.academicYearId,input.year.id),
   eq(curriculumAnnualAdoptions.packId,input.packId))).limit(1);
  if(existing){
   if(existing.status==="active"&&existing.packVersionId===input.versionId)
    return {adoptionId:existing.id,created:false};
   throw new Error("Annual adoption is pinned. Revision or rollback requires a separately authorized workflow.");
  }
  const metadata=entitlement.metadata??{};
  const parse=(v:unknown)=>typeof v==="string"&&!Number.isNaN(Date.parse(v))?new Date(v):null;
  if(!annualAdoptionEligible({
   scope:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id},
   adoption:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id,
    packId:input.packId,packVersionId:version.id,status:"active",supersededAt:null},
   license:{organizationId:entitlement.organizationId,packId:entitlement.packId,
    publisherOrganizationId:"",status:entitlement.status,startsAt:parse(metadata.licenseStartsAt),
    endsAt:parse(metadata.licenseEndsAt),withdrawnAt:parse(metadata.withdrawnAt)},
   year:input.year,now:input.now??new Date(),packVersionPublished:true,
  }))throw new AuthorizationError("publisher license must cover the entire target school year");
  const [row]=await tx.insert(curriculumAnnualAdoptions).values({
   organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
   academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id,
   packId:input.packId,packVersionId:version.id,entitlementId:entitlement.id,createdByPersonId:actor.actorPersonId,
  }).returning({id:curriculumAnnualAdoptions.id});
  if(!row)throw new Error("Unable to create annual curriculum adoption.");
  await writeAudit(tx,actor,{action:"curriculum.adoption.year_rollover",entityType:"curriculum_annual_adoption",
   entityId:row.id,scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
   after:{academicYearId:input.year.id,packId:input.packId,packVersionId:version.id,entitlementId:entitlement.id}});
  await emitEvent(tx,{eventType:"curriculum.adoption.year_rolled_over",aggregateType:"curriculum_annual_adoption",
   aggregateId:row.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
   siteId:program.siteId,programId:program.id,payload:{academicYearId:input.year.id,packVersionId:version.id}});
  return {adoptionId:row.id,created:true};
 });
}
