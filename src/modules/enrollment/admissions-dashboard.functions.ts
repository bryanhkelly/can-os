import {createServerFn} from "@tanstack/react-start";
import {eq,inArray,and} from "drizzle-orm";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {operationsSelectionSchema,resolveOperationsSelection} from "@/modules/operations/operations-scope.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import type {AdmissionsPipelineItem} from "@/domain/admissions-pipeline";
/** Verified registrars see program-scoped applications and their canonical offer/enrollment state. */
export const getAdmissionsDashboard=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.parse(value??{}))
 .handler(async({data})=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.organizationIds?.length)throw new AuthorizationError("registrar admissions dashboard");
 assertCapability(actor,"enrollment.decide");
 const scoped=await resolveOperationsSelection(actor,data);
 if(!process.env.DATABASE_URL)return [] as (AdmissionsPipelineItem & {studentName:string;programId:string;disposition:string|null;offers:{id:string;status:string;expiresAt:string|null;schoolYearId:string}[];enrollments:{schoolYearId:string;status:string}[];activeSectionCount:number;studentAccessStatus:string})[];
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const records=await db.select({id:s.applications.id,stage:s.applications.stage,submittedAt:s.applications.submittedAt,program:s.programs.name,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId,
  studentPersonId:s.studentProfiles.personId,siteId:s.programs.siteId,
  organizationId:s.programs.organizationId,
  firstName:s.people.legalFirstName,lastName:s.people.legalLastName,preferredName:s.people.preferredName,metadata:s.applications.metadata,
 }).from(s.applications).innerJoin(s.programs,eq(s.applications.programId,s.programs.id))
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.applications.studentProfileId))
  .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(inArray(s.applications.programId,scoped.programIds)).limit(150);
 const synthetic=records;
 if(!synthetic.length)return [];
 const ids=synthetic.map(x=>x.id);
 const journeys=await db.select({id:s.journeys.id,participantId:s.journeys.participantId}).from(s.journeys).where(inArray(s.journeys.participantId,ids));
 const offers=await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,schoolYearId:s.admissionOffers.schoolYearId,createdAt:s.admissionOffers.createdAt}).from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,ids));
 const enrollmentRows=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId,schoolYearId:s.enrollments.schoolYearId,status:s.enrollments.status,kind:s.enrollments.kind}).from(s.enrollments).where(inArray(s.enrollments.studentProfileId,[...new Set(synthetic.map(x=>x.studentProfileId))]));
 const accessConsents=await db.select({applicationId:s.studentAccessConsents.applicationId,
  status:s.studentAccessConsents.status}).from(s.studentAccessConsents)
  .where(inArray(s.studentAccessConsents.applicationId,ids));
 const accessByApplication=new Map(accessConsents.map(consent=>[consent.applicationId,consent.status]));
 // An approved consent remains historical after a revocation. Use the
 // actual currently active student-only grant in this admissions projection.
 const availableGrants=await db.select({
   applicationId:s.studentAccessConsents.applicationId,
   personId:s.accountPersonGrants.personId,
   organizationId:s.accountPersonGrants.organizationId,
   siteId:s.accountPersonGrants.siteId,
 }).from(s.studentAccessConsents)
   .innerJoin(s.accessAccounts,eq(s.accessAccounts.emailNormalized,s.studentAccessConsents.studentEmail))
   .innerJoin(s.accountPersonGrants,eq(s.accountPersonGrants.accountId,s.accessAccounts.id))
   .where(and(inArray(s.studentAccessConsents.applicationId,ids),
     eq(s.studentAccessConsents.status,"approved"),
     eq(s.accessAccounts.disabled,false),
     eq(s.accountPersonGrants.active,true),
     eq(s.accountPersonGrants.isSynthetic,false),
     eq(s.accountPersonGrants.role,"student")));

 const requirements=journeys.length?await db.select({journeyId:s.journeyRequirements.journeyId,status:s.journeyRequirements.status,blocking:s.journeyRequirements.blocking}).from(s.journeyRequirements).where(inArray(s.journeyRequirements.journeyId,journeys.map(x=>x.id))):[];
 return synthetic.map(x=>({id:x.id,studentName:`${x.preferredName??x.firstName} ${x.lastName}`,programId:x.programId,program:x.program,stage:x.stage,
  disposition:x.metadata.admissionsDisposition==="waitlisted"?"waitlisted":null,
  activeSectionCount:enrollmentRows.filter(e=>e.studentProfileId===x.studentProfileId&&e.programId===x.programId&&
    e.kind==="section"&&e.status==="active"&&enrollmentRows.some(programEnrollment=>
      programEnrollment.studentProfileId===x.studentProfileId&&
      programEnrollment.programId===x.programId&&programEnrollment.kind==="program"&&
      programEnrollment.status==="active"&&programEnrollment.schoolYearId===e.schoolYearId)).length,
  studentAccessStatus:accessByApplication.get(x.id)==="approved" &&
    !availableGrants.some(grant=>grant.applicationId===x.id &&
      grant.personId===x.studentPersonId && grant.organizationId===x.organizationId &&
      grant.siteId===x.siteId)
      ? "access_unavailable" : accessByApplication.get(x.id)??"not_requested",
  submittedAt:x.submittedAt?.toISOString()??null,outstandingRequirements:requirements.filter(req=>req.blocking&&req.status!=="complete"&&journeys.some(j=>j.id===req.journeyId&&j.participantId===x.id)).length,enrollments:enrollmentRows.filter(e=>e.studentProfileId===x.studentProfileId&&e.programId===x.programId&&e.kind==="program"&&e.status==="active").map(e=>({schoolYearId:e.schoolYearId,status:e.status})),offers:offers.filter(o=>o.applicationId===x.id).sort((a,b)=>b.createdAt.getTime()-a.createdAt.getTime()).map(o=>({id:o.id,status:o.status,expiresAt:o.expiresAt?.toISOString()??null,schoolYearId:o.schoolYearId}))}));
});

export const getSyntheticAdmissionsDashboard=getAdmissionsDashboard;


/** Counts every active program enrollment in the authorized school scope, including
 * students enrolled outside the admissions application workflow. */
export const getActiveEnrollmentCounts=createServerFn({method:"GET"})
 .validator((value:unknown)=>operationsSelectionSchema.parse(value??{}))
 .handler(async({data})=>{
  const actor=await getCommandContext(getRequest());
  setResponseHeader("Cache-Control","private, no-store");
  if(actor.role!=="registrar"||!actor.actorPersonId||!actor.scope.organizationIds?.length)
   throw new AuthorizationError("registrar enrollment totals");
  assertCapability(actor,"enrollment.decide");
  const scoped=await resolveOperationsSelection(actor,data);
  if(!process.env.DATABASE_URL)return [] as {programId:string;activeStudents:number}[];
  if(!scoped.programIds.length)return [];
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const {countDistinct}=await import("drizzle-orm");
  return db.select({
   programId:s.enrollments.programId,
   activeStudents:countDistinct(s.enrollments.studentProfileId),
  }).from(s.enrollments)
   .where(and(inArray(s.enrollments.programId,scoped.programIds),
    eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active")))
   .groupBy(s.enrollments.programId);
 });
