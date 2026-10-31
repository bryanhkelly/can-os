import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {and,eq,inArray,desc} from "drizzle-orm";
import {z} from "zod";
import {admissionOfferProgress} from "@/domain/admission-offer-progress";
import {verifiedEnrollmentStudentIds} from "@/domain/guardian-offer-visibility";
import {staffedPublishedSectionIds} from "./instructional-section-readiness.server";

/** Only offers for students whose enrollment this session's guardian can manage. */
export const getGuardianAdmissionOffers=createServerFn({method:"GET"})
 .validator((input:unknown)=>z.object({studentPersonId:z.string().uuid().optional()}).parse(input??{}))
 .handler(async({data})=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="guardian"||!actor.actorPersonId)throw new AuthorizationError("guardian enrollment offers");
 assertCapability(actor,"enrollment.apply");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const relations=await db.select({
  studentPersonId:s.guardianRelationships.studentPersonId,
  canManageEnrollment:s.guardianRelationships.canManageEnrollment,
  metadata:s.guardianRelationships.metadata,
 }).from(s.guardianRelationships)
  .where(and(eq(s.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(s.guardianRelationships.canManageEnrollment,true),...(data.studentPersonId?[eq(s.guardianRelationships.studentPersonId,data.studentPersonId)]:[])));
 // A legacy or self-asserted relationship may have canManageEnrollment=true
 // without independent verification. Never expose a child's admissions record
 // or offers until the school has verified that precise relationship.
 const verifiedStudents=verifiedEnrollmentStudentIds(relations);
 if(!verifiedStudents.length)return [];
 const profiles=await db.select({id:s.studentProfiles.id,personId:s.studentProfiles.personId}).from(s.studentProfiles)
  .where(inArray(s.studentProfiles.personId,verifiedStudents));
 if(!profiles.length)return [];
 const students=await db.select({profileId:s.studentProfiles.id,firstName:s.people.legalFirstName,lastName:s.people.legalLastName})
  .from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(inArray(s.studentProfiles.id,profiles.map(p=>p.id)));
 const nameByProfile=new Map(students.map(p=>[p.profileId,[p.firstName,p.lastName].filter(Boolean).join(" ")]));
 const personByProfile=new Map(profiles.map(p=>[p.id,p.personId]));
 const apps=await db.select({id:s.applications.id,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId,programName:s.programs.name,
  stage:s.applications.stage,metadata:s.applications.metadata,
  submittedByPersonId:s.applications.submittedByPersonId})
  .from(s.applications).innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
  .where(inArray(s.applications.studentProfileId,profiles.map(p=>p.id)));
 const permitted=apps.filter(app=>actor.scope.programIds?.includes(app.programId));
 if(!permitted.length)return [];
 const originIds=[...new Set(permitted.map(app=>
  typeof app.metadata.originTransferActionId==="string"?app.metadata.originTransferActionId:null
 ).filter((id):id is string=>!!id))];
 const originTransfers=originIds.length?await db.select({
  id:s.actions.id,status:s.actions.status,subjectId:s.actions.subjectId,
  metadata:s.actions.metadata,
 }).from(s.actions).where(and(eq(s.actions.type,"guardian_enrollment_change_request"),
  inArray(s.actions.id,originIds))):[];
 const offers=await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,schoolYearId:s.admissionOffers.schoolYearId})
  .from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,permitted.map(a=>a.id)))
  .orderBy(desc(s.admissionOffers.createdAt)).limit(150);
 const journeys=await db.select({id:s.journeys.id,applicationId:s.journeys.participantId,status:s.journeys.status})
  .from(s.journeys).where(and(eq(s.journeys.participantType,"application"),inArray(s.journeys.participantId,permitted.map(app=>app.id))));
 const requirements=journeys.length?await db.select({id:s.journeyRequirements.id,journeyId:s.journeyRequirements.journeyId,
  title:s.journeyRequirements.title,status:s.journeyRequirements.status})
  .from(s.journeyRequirements).where(and(inArray(s.journeyRequirements.journeyId,journeys.map(journey=>journey.id)),
   eq(s.journeyRequirements.blocking,true))):[];
 const enrollments=await db.select({studentProfileId:s.enrollments.studentProfileId,programId:s.enrollments.programId,
  schoolYearId:s.enrollments.schoolYearId,kind:s.enrollments.kind,
  sectionId:s.enrollments.sectionId,sectionYearId:s.terms.schoolYearId,
  sectionActive:s.sections.active,sectionProgramId:s.sections.programId})
  .from(s.enrollments)
  .leftJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .leftJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .where(and(inArray(s.enrollments.studentProfileId,profiles.map(profile=>profile.id)),
   inArray(s.enrollments.programId,permitted.map(app=>app.programId)),eq(s.enrollments.status,"active")));
 const instructionalIds=await staffedPublishedSectionIds(enrollments
  .map(row=>row.sectionId).filter((id):id is string=>!!id),db);
 const years=offers.length?await db.select({id:s.schoolYears.id,name:s.schoolYears.name}).from(s.schoolYears)
  .where(inArray(s.schoolYears.id,offers.map(offer=>offer.schoolYearId))):[];
 return permitted.map(app=>{
  const journey=journeys.find(row=>row.applicationId===app.id);
  const blockers=requirements.filter(row=>row.journeyId===journey?.id&&row.status!=="complete")
   .map(({id,title,status})=>({id,title,status}));
  return {applicationId:app.id,studentPersonId:personByProfile.get(app.studentProfileId)!,
   studentName:nameByProfile.get(app.studentProfileId)??"Student",program:app.programName,
   applicationStage:app.stage,waitlisted:app.metadata.admissionsDisposition==="waitlisted",
   transferOriginExited:(()=>{
     if(typeof app.metadata.originTransferActionId!=="string")return null;
     const original=originTransfers.find(item=>item.id===app.metadata.originTransferActionId);
     if(!original||original.subjectId!==app.studentProfileId||
        original.metadata.requestedByGuardianPersonId!==actor.actorPersonId||
        original.metadata.kind!=="transfer")return null;
     return original.status==="resolved"&&
       original.metadata.exitCompletedByRegistrar===true&&
       original.metadata.exitStatus==="transferred";
   })(),
   blockers,offers:offers.filter(o=>o.applicationId===app.id).map(o=>{
    const active=enrollments.filter(row=>row.studentProfileId===app.studentProfileId&&row.programId===app.programId&&row.schoolYearId===o.schoolYearId);
    const enrollmentActive=active.some(row=>row.kind==="program");
    const sectionCount=active.filter(row=>row.kind==="section"&&row.sectionActive===true&&
     row.sectionProgramId===app.programId&&row.sectionYearId===o.schoolYearId&&
     !!row.sectionId&&instructionalIds.has(row.sectionId)).length;
    return {id:o.id,status:o.status,expiresAt:o.expiresAt?.toISOString()??null,schoolYearId:o.schoolYearId,
     schoolYearName:years.find(year=>year.id===o.schoolYearId)?.name??o.schoolYearId,
     enrollmentActive,sectionCount,progress:admissionOfferProgress({status:o.status,expiresAt:o.expiresAt?.toISOString()??null,
      journeyStatus:journey?.status??null,blockers:blockers.length,enrollmentActive,sectionCount,
      applicationStage:app.stage,waitlisted:app.metadata.admissionsDisposition==="waitlisted"})};
   })};
 });
});

/** Existing callers migrate without changing the permission boundary. */
export const getGuardianSyntheticAdmissionOffers=getGuardianAdmissionOffers;
