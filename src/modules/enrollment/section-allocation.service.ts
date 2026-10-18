import { db } from "@/db/client";
import * as s from "@/db/schema";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import type { CommandContext } from "@/domain/command-context";
import { isPassingGrade } from "@/domain/grade-scale-policy";
import { findSectionScheduleConflicts } from "@/modules/academic-time/section-schedule-service";
import { getSectionRegistrationPolicy } from "@/modules/learning/section-registration-policy-service";
import { emitEvent,notifyMany,writeAudit } from "@/platform/mutation";
import { and,eq,inArray,sql } from "drizzle-orm";

export type EnrollmentTransaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export type SectionPlacementInput={
 studentProfileId:string;sectionId:string;actor:CommandContext;source:string;
 applicationId?:string;requestId?:string;
};
export async function activateSectionEnrollment(tx:EnrollmentTransaction,input:SectionPlacementInput){
 const {studentProfileId,sectionId,actor}=input;
 if(!actor.actorPersonId)throw new Error("Authenticated actor required");
 // Staff and self-service registration share one site configuration lock.
 // Acquire BEFORE section FOR UPDATE to avoid inversion with staff attendance.
 const [sectionSite]=await tx.select({siteId:s.sections.siteId,
  programId:s.sections.programId}).from(s.sections)
  .where(eq(s.sections.id,sectionId)).limit(1);
 if(!sectionSite || !actor.scope.programIds?.includes(sectionSite.programId) ||
  (sectionSite.siteId!==null && !actor.scope.siteIds?.includes(sectionSite.siteId)))
  throw new Error("Section outside authorized school and program scope");
 // Site-less online sections have no onsite attendance configuration to coordinate.
 if(sectionSite.siteId)await lockAttendanceConfigurationAtSite(tx,sectionSite.siteId);
 const [section]=await tx.select({id:s.sections.id,metadata:s.sections.metadata,
  termId:s.sections.termId,startsOn:s.terms.startsOn,endsOn:s.terms.endsOn,
  programId:s.sections.programId,siteId:s.sections.siteId,
  organizationId:s.programs.organizationId,schoolYearId:s.terms.schoolYearId})
  .from(s.sections).innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
  .where(and(eq(s.sections.id,sectionId),eq(s.sections.active,true)))
  .limit(1).for("update");
 if(!section)throw new Error("Section not active");
 if(!actor.scope.programIds?.includes(section.programId)||
  !actor.scope.organizationIds?.includes(section.organizationId)||
  (actor.scope.siteIds?.length&&(!section.siteId||!actor.scope.siteIds.includes(section.siteId))))
  throw new Error("Section outside authorized scope");
 const lock="section-allocation:"+sectionId;
 await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${lock}))`);
 const [membership]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
  .where(and(eq(s.enrollments.studentProfileId,studentProfileId),
   eq(s.enrollments.programId,section.programId),
   eq(s.enrollments.schoolYearId,section.schoolYearId),
   eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"))).limit(1);
 if(!membership)throw new Error("Student needs an active program enrollment");
 const [already]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
  .where(and(eq(s.enrollments.studentProfileId,studentProfileId),
   eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.kind,"section"),
   eq(s.enrollments.status,"active"))).limit(1);
 if(already)return {enrollmentId:already.id,created:false};
 const policy=await getSectionRegistrationPolicy(sectionId,tx);
 const today=new Date().toISOString().slice(0,10);
 if(today>policy.addDropEndsOn)throw new Error("Add/drop deadline has passed");
 const [rosterCount]=await tx.select({total:sql<number>`count(*)::int`}).from(s.enrollments)
  .where(and(eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.kind,"section"),
   eq(s.enrollments.status,"active")));
 const total=rosterCount?.total??0;
 if(total>=policy.enrollmentCapacity)throw new Error("Section is full");
 const current=await tx.select({id:s.enrollments.id,termId:s.sections.termId,
  code:s.sections.code,metadata:s.sections.metadata,template:s.sections.courseTemplateVersionId,
  sectionId:s.sections.id})
  .from(s.enrollments).innerJoin(s.sections,eq(s.enrollments.sectionId,s.sections.id))
  .where(and(eq(s.enrollments.studentProfileId,studentProfileId),
   eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active")));
 const sameTerm=current.filter(row=>row.termId===section.termId);
 const sum=await sameTerm.reduce(async(promise,row)=>{
  const n=await promise;
  const currentPolicy=await getSectionRegistrationPolicy(row.sectionId,tx);
  return n+currentPolicy.credits;
 },Promise.resolve(0));
 if(sum+policy.credits>policy.maxCreditsPerTerm)throw new Error("Term credit limit exceeded");
 const conflicts=await findSectionScheduleConflicts(sectionId,sameTerm.map(row=>row.sectionId),tx);
 if(conflicts.length)throw new Error("Schedule conflict");
 const prereqs=policy.prerequisites;
 if(prereqs.length){
  const grades=await tx.select({sectionCode:s.sections.code,courseCode:s.courseTemplates.code,
   grade:s.sectionGrades.letterGrade,gradeScaleId:s.sectionGrades.gradeScaleId})
   .from(s.sectionGrades).innerJoin(s.sections,eq(s.sections.id,s.sectionGrades.sectionId))
   .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
   .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
   .where(and(eq(s.sectionGrades.studentProfileId,studentProfileId),
    eq(s.sectionGrades.status,"finalized")));
  // Passing is defined by each grade's versioned scale, not a hard-coded list.
  const scaleIds=[...new Set(grades.map(g=>g.gradeScaleId).filter((id):id is string=>Boolean(id)))];
  const scaleRows=scaleIds.length?await tx.select({id:s.gradeScales.id,configuration:s.gradeScales.configuration})
   .from(s.gradeScales).where(inArray(s.gradeScales.id,scaleIds)):[];
  const scaleConfigById=new Map(scaleRows.map(row=>[row.id,row.configuration] as const));
  const completed=new Set(grades.filter(g=>{
   const configuration=g.gradeScaleId?scaleConfigById.get(g.gradeScaleId):null;
   if(g.gradeScaleId&&!configuration)throw new Error("Finalized grade scale is unavailable");
   return isPassingGrade(g.grade,configuration);
  })
   .flatMap(g=>[g.sectionCode,g.courseCode]));
  const unmet=prereqs.filter(prereq=>!completed.has(prereq));
  if(unmet.length)throw new Error("Unmet prerequisites: "+unmet.join(", "));
 }
 const [enrolled]=await tx.insert(s.enrollments).values({
  studentProfileId,kind:"section",status:"active",organizationId:section.organizationId,
  programId:section.programId,schoolYearId:section.schoolYearId,
  sectionId,startedAt:new Date(),
  metadata:{source:input.source,...(input.requestId?{changeRequestId:input.requestId}:{})},
 }).returning({id:s.enrollments.id});
 if(!enrolled)throw new Error("Failed to activate section");
 const assessments=await tx.select({id:s.assessments.id}).from(s.assessments)
  .where(and(eq(s.assessments.sectionId,sectionId),eq(s.assessments.status,"published")));
 if(assessments.length)await tx.insert(s.submissions).values(assessments.map(a=>({
  assessmentId:a.id,studentProfileId,status:"assigned" as const,timeliness:"on_time" as const,
 }))).onConflictDoNothing();
 const [student]=await tx.select({personId:s.studentProfiles.personId}).from(s.studentProfiles)
  .where(eq(s.studentProfiles.id,studentProfileId)).limit(1);
 if(student){
  const guardian=await tx.select({personId:s.guardianRelationships.guardianPersonId})
   .from(s.guardianRelationships).where(and(
    eq(s.guardianRelationships.studentPersonId,student.personId),
    eq(s.guardianRelationships.canViewAcademics,true)));
  const recipients=[...new Set([student.personId,...guardian.map(g=>g.personId)])];
  if(recipients.length)await notifyMany(tx, recipients.map(recipientPersonId=>({
   recipientPersonId,type:"course_placement",status:"unread" as const,
   title:"New class available",body:"A new class has been added to your schedule.",
   resourceType:"section",resourceId:sectionId,
  })));
 }
 await emitEvent(tx, {eventType:"SectionEnrollmentActivated",
  aggregateType:"enrollment",aggregateId:enrolled.id,actorPersonId:actor.actorPersonId,
  payload:{studentProfileId,sectionId,programId:section.programId,
   applicationId:input.applicationId??null,requestId:input.requestId??null}});
 await writeAudit(tx, {actorPersonId:actor.actorPersonId,
  action:"enrollment.section.activate",resourceType:"enrollment",resourceId:enrolled.id,
  scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
  after:{studentProfileId,sectionId,source:input.source}});
 return {enrollmentId:enrolled.id,created:true};
}
