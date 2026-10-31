import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {programs,schoolYears,curriculumEntitlements,curriculumPackVersions} from "@/db/schema";
import {curriculumAnnualAdoptions} from "@/db/schema/curriculum-year-adoptions";
import {AuthorizationError} from "@/domain/command-context";
import {hasInstitutionalProgramCapability} from "@/modules/identity/institutional-capability.server";
import type {Actor} from "@/modules/identity/actors.server";
import {emitEvent} from "@/platform/mutation";
import {recordAudit} from "@/modules/identity/actors.server";
import {annualAdoptionEligible} from "@/domain/curriculum-year-policy";
import {EventTypes} from "@/domain/event-types";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Year={id:string;startsAt:Date;endsAt:Date};
async function canonicalYear(query:Pick<Tx,"select">,program:{id:string;organizationId:string;siteId:string|null},yearId:string):Promise<Year>{
 if(!program.siteId)throw new AuthorizationError("program site");
 const [year]=await query.select().from(schoolYears).where(and(eq(schoolYears.id,yearId),
  eq(schoolYears.organizationId,program.organizationId),eq(schoolYears.siteId,program.siteId))).limit(1);
 if(!year||(year.programId!==null&&year.programId!==program.id))
  throw new AuthorizationError("canonical school year");
 const startsAt=new Date(year.startsOn+"T00:00:00Z");
 const endsAt=new Date(year.endsOn+"T00:00:00Z");
 if(startsAt>endsAt)throw new Error("Invalid school year");
 return {id:year.id,startsAt,endsAt};
}
/** Caller must resolve the canonical academic year server-side; never infer it from a previous adoption. */
export async function readAnnualAdoptionEligibility(actor:Actor, input:{
 programId:string;academicYearId:string;packId:string;now?:Date;
}, executor:Pick<Tx,"select">=db){
 const [program]=await executor.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
 if(!program || !await hasInstitutionalProgramCapability(actor,program,"curriculum.adopt",executor))
  throw new AuthorizationError("institutional curriculum adoption grant and program scope");
 const resolvedYear=await canonicalYear(executor,program,input.academicYearId);
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
 const eligible=!!license && !!date(metadata.licenseStartsAt) && !!date(metadata.licenseEndsAt) && annualAdoptionEligible({
  scope:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
   academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id},
  adoption,license:{organizationId:license.organizationId,packId:license.packId,
   publisherOrganizationId:"",status:license.status,startsAt:date(metadata.licenseStartsAt),
   endsAt:date(metadata.licenseEndsAt),withdrawnAt:date(metadata.withdrawnAt)},
  year:resolvedYear,now:input.now??new Date(),packVersionPublished:version?.status==="published",
 });
 return {eligible,reason:eligible?"active" as const:"invalid_or_expired" as const,versionId:adoption.packVersionId};
}
/** Explicit rollover, one annual record per Program/year/pack. Existing sections are not touched. */
export async function rolloverCurriculumAdoption(actor:Actor,input:{
 programId:string;academicYearId:string;packId:string;versionId:string;now?:Date;
}){
 return db.transaction(async tx=>{
  const [program]=await tx.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
  if(!program||!await hasInstitutionalProgramCapability(actor,program,"curriculum.adopt",tx))
   throw new AuthorizationError("institutional curriculum adoption grant and program scope");
  const resolvedYear=await canonicalYear(tx,program,input.year.id);
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
   if(existing.status==="active"&&existing.packVersionId===input.versionId){
    const current=await readAnnualAdoptionEligibility(actor,{programId:program.id,academicYearId:input.academicYearId,packId:input.packId,now:input.now},tx);
    if(!current.eligible)throw new AuthorizationError("existing annual adoption no longer has valid license rights");
    return {adoptionId:existing.id,created:false};
   }
   throw new Error("Annual adoption is pinned. Revision or rollback requires a separately authorized workflow.");
  }
  const metadata=entitlement.metadata??{};
  const parse=(v:unknown)=>typeof v==="string"&&!Number.isNaN(Date.parse(v))?new Date(v):null;
  if(!parse(metadata.licenseStartsAt)||!parse(metadata.licenseEndsAt)||!annualAdoptionEligible({
   scope:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id},
   adoption:{organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
    academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id,
    packId:input.packId,packVersionId:version.id,status:"active",supersededAt:null},
   license:{organizationId:entitlement.organizationId,packId:entitlement.packId,
    publisherOrganizationId:"",status:entitlement.status,startsAt:parse(metadata.licenseStartsAt),
    endsAt:parse(metadata.licenseEndsAt),withdrawnAt:parse(metadata.withdrawnAt)},
   year:resolvedYear,now:input.now??new Date(),packVersionPublished:true,
  }))throw new AuthorizationError("publisher license must cover the entire target school year");
  const [row]=await tx.insert(curriculumAnnualAdoptions).values({
   organizationId:program.organizationId,programId:program.id,siteId:program.siteId,
   academicProviderOrganizationId:program.academicProviderOrganizationId,academicYearId:input.year.id,
   packId:input.packId,packVersionId:version.id,entitlementId:entitlement.id,createdByPersonId:actor.actorPersonId,
  }).returning({id:curriculumAnnualAdoptions.id});
  if(!row)throw new Error("Unable to create annual curriculum adoption.");
  await recordAudit(tx,actor,{action:"curriculum.adoption.year_rollover",resourceType:"curriculum_annual_adoption",
   resourceId:row.id,scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
   after:{academicYearId:input.year.id,packId:input.packId,packVersionId:version.id,entitlementId:entitlement.id}});
  await emitEvent(tx,{eventType:EventTypes.CurriculumAnnualAdoptionRolledOver,aggregateType:"curriculum_annual_adoption",
   aggregateId:row.id,actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
   siteId:program.siteId,programId:program.id,payload:{academicYearId:input.year.id,packVersionId:version.id}});
  return {adoptionId:row.id,created:true};
 });
}

/** Explicit rollback is terminal; restoration requires a new reviewed adoption process.
 * Existing Sections keep their original pinned course release.
 */
export async function rollbackAnnualCurriculumAdoption(actor:Actor,input:{
 programId:string;academicYearId:string;packId:string;reason:string;
}){
 if(!input.reason.trim())throw new Error("A rollback reason is required.");
 return db.transaction(async tx=>{
  const [program]=await tx.select().from(programs).where(eq(programs.id,input.programId)).limit(1);
  if(!program||!await hasInstitutionalProgramCapability(actor,program,"curriculum.adopt",tx))
   throw new AuthorizationError("institutional curriculum adoption grant and program scope");
  const [existing]=await tx.select().from(curriculumAnnualAdoptions).where(and(
   eq(curriculumAnnualAdoptions.programId,program.id),
   eq(curriculumAnnualAdoptions.academicYearId,input.academicYearId),
   eq(curriculumAnnualAdoptions.packId,input.packId))).limit(1);
  if(!existing||existing.organizationId!==program.organizationId||
     existing.siteId!==program.siteId||
     existing.academicProviderOrganizationId!==program.academicProviderOrganizationId)
   throw new AuthorizationError("annual adoption scope");
  if(existing.status==="rolled_back")return {adoptionId:existing.id,rolledBack:false};
  if(existing.status!=="active")throw new Error("Only active annual adoptions can be rolled back.");
  const [changed]=await tx.update(curriculumAnnualAdoptions)
   .set({status:"rolled_back",supersededAt:new Date()})
   .where(and(eq(curriculumAnnualAdoptions.id,existing.id),eq(curriculumAnnualAdoptions.status,"active")))
   .returning({id:curriculumAnnualAdoptions.id});
  if(!changed)throw new Error("Concurrent annual adoption change; retry after refreshing.");
  await recordAudit(tx,actor,{action:"curriculum.adoption.year_rollback",
   resourceType:"curriculum_annual_adoption",resourceId:existing.id,
   scope:{organizationId:program.organizationId,siteId:program.siteId,programId:program.id},
   before:{status:existing.status,packVersionId:existing.packVersionId},
   after:{status:"rolled_back",reason:input.reason.trim(),academicYearId:input.academicYearId}});
  await emitEvent(tx,{eventType:EventTypes.CurriculumAnnualAdoptionRolledBack,
   aggregateType:"curriculum_annual_adoption",aggregateId:existing.id,
   actorPersonId:actor.actorPersonId,organizationId:program.organizationId,
   siteId:program.siteId,programId:program.id,payload:{academicYearId:input.academicYearId}});
  return {adoptionId:existing.id,rolledBack:true};
 });
}
