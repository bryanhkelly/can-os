import {and,eq,inArray,sql} from "drizzle-orm";
import {db} from "@/db/client";
import * as s from "@/db/schema";
import type {CommandContext} from "@/domain/command-context";

export type EnrollmentTransaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
export type SectionPlacementInput={
 studentProfileId:string;sectionId:string;actor:CommandContext;source:string;
 applicationId?:string;requestId?:string;
};
export async function activateSectionEnrollment(tx:EnrollmentTransaction,input:SectionPlacementInput){
 const {studentProfileId,sectionId,actor}=input;
 if(!actor.actorPersonId)throw new Error("Authenticated actor required");
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
 const raw=section.metadata.registrationPolicy;
 const policy=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw as Record<string,unknown>:{};
 const today=new Date().toISOString().slice(0,10);
 const cutoff=typeof policy.addDropEndsOn==="string"?policy.addDropEndsOn:section.startsOn;
 if(today>cutoff)throw new Error("Add/drop deadline has passed");
 const capacity=typeof policy.capacity==="number"?policy.capacity:30;
 const [{total}]=await tx.select({total:sql<number>`count(*)::int`}).from(s.enrollments)
  .where(and(eq(s.enrollments.sectionId,sectionId),eq(s.enrollments.kind,"section"),
   eq(s.enrollments.status,"active")));
 if(total>=capacity)throw new Error("Section is full");
 const current=await tx.select({id:s.enrollments.id,termId:s.sections.termId,
  code:s.sections.code,metadata:s.sections.metadata,template:s.sections.courseTemplateVersionId})
  .from(s.enrollments).innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .where(and(eq(s.enrollments.studentProfileId,studentProfileId),
   eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active")));
 const sameTerm=current.filter(row=>row.termId===section.termId);
 const credit=(meta:Record<string,unknown>)=>typeof meta.credits==="number"?meta.credits:1;
 const sum=sameTerm.reduce((n,row)=>n+credit(row.metadata),0);
 const limit=typeof section.metadata.maxCreditsPerTerm==="number"?section.metadata.maxCreditsPerTerm:7;
 if(sum+credit(section.metadata)>limit)throw new Error("Term credit limit exceeded");
 const meeting=typeof policy.meetingKey==="string"?policy.meetingKey:null;
 if(meeting&&sameTerm.some(row=>{
  const item=row.metadata.registrationPolicy;
  return item&&typeof item==="object"&&
   (item as Record<string,unknown>).meetingKey===meeting;
 }))throw new Error("Schedule conflict");
 const prereqs=Array.isArray(policy.prerequisites)?policy.prerequisites
  .filter((p):p is string=>typeof p==="string"):[];
 if(prereqs.length){
  const grades=await tx.select({sectionCode:s.sections.code,courseCode:s.courseTemplates.code,
   grade:s.sectionGrades.letterGrade})
   .from(s.sectionGrades).innerJoin(s.sections,eq(s.sections.id,s.sectionGrades.sectionId))
   .innerJoin(s.courseTemplateVersions,eq(s.courseTemplateVersions.id,s.sections.courseTemplateVersionId))
   .innerJoin(s.courseTemplates,eq(s.courseTemplates.id,s.courseTemplateVersions.courseTemplateId))
   .where(and(eq(s.sectionGrades.studentProfileId,studentProfileId),
    eq(s.sectionGrades.status,"finalized")));
  const completed=new Set(grades.filter(g=>["A","B","C","D","P","Pass"].includes(g.grade??""))
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
  if(recipients.length)await tx.insert(s.notifications).values(recipients.map(recipientPersonId=>({
   recipientPersonId,type:"course_placement",status:"unread" as const,
   title:"New class available",body:"A new class has been added to your schedule.",
   resourceType:"section",resourceId:sectionId,
  })));
 }
 await tx.insert(s.domainEvents).values({eventType:"SectionEnrollmentActivated",
  aggregateType:"enrollment",aggregateId:enrolled.id,actorPersonId:actor.actorPersonId,
  payload:{studentProfileId,sectionId,programId:section.programId,
   applicationId:input.applicationId??null,requestId:input.requestId??null}});
 await tx.insert(s.auditEvents).values({actorPersonId:actor.actorPersonId,
  action:"enrollment.section.activate",resourceType:"enrollment",resourceId:enrolled.id,
  scope:{organizationId:section.organizationId,siteId:section.siteId,programId:section.programId},
  after:{studentProfileId,sectionId,source:input.source}});
 return {enrollmentId:enrolled.id,created:true};
}
