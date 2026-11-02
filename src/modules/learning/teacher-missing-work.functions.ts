import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { accessibleClasses, authorizeClass } from "./class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and,eq,inArray,lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
async function verifiedTeacher(){
 const context=await getCommandContext(getRequest());
 if(context.role!=="teacher"||!context.actorPersonId)throw new AuthorizationError("teacher identity required");
 assertCapability(context,"assignments:grade");
 if(!context.scope.siteIds?.length && !context.scope.sectionIds?.length)
  throw new AuthorizationError("teacher named class membership");
 return context;
}

/** Missing work for students actively enrolled in sections taught in the verified program scope. */
export const getTeacherMissingWork=createServerFn({method:"GET"}).handler(async()=>{
 const context=await verifiedTeacher();
 if(!process.env.DATABASE_URL)return {connected:false,items:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 // Teacher Today and gradebook already use this live, exact-Section
 // authority. Never require a host Site grant for an institution teacher.
 const sectionIds=[...new Set((await accessibleClasses(context as Actor)).map(x=>x.id))];
 if(!sectionIds.length)return {connected:true,items:[]};
 const now=new Date();
 const due=await db.select({id:s.assessments.id,title:s.assessments.title,dueAt:s.assessments.dueAt,sectionId:s.assessments.sectionId,course:s.sections.title}).from(s.assessments)
  .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
  .where(and(inArray(s.assessments.sectionId,sectionIds),inArray(s.assessments.status,["published","closed"]),lt(s.assessments.dueAt,now)));
 if(!due.length)return {connected:true,items:[]};
 const activeProgram=alias(s.enrollments,"missing_work_program_membership");
 const roster=await db.select({sectionId:s.enrollments.sectionId,studentId:s.studentProfiles.id,studentName:s.people.legalFirstName,studentLastName:s.people.legalLastName}).from(s.enrollments)
  .innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
  .innerJoin(s.terms,eq(s.terms.id,s.sections.termId))
  .innerJoin(activeProgram,and(
    eq(activeProgram.studentProfileId,s.enrollments.studentProfileId),
    eq(activeProgram.programId,s.sections.programId),
    eq(activeProgram.schoolYearId,s.terms.schoolYearId),
    eq(activeProgram.kind,"program"),eq(activeProgram.status,"active"),
  ))
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
  .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),
    eq(s.enrollments.schoolYearId,s.terms.schoolYearId),
    inArray(s.enrollments.sectionId,sectionIds)));
 const eligible=roster;
 if(!eligible.length)return {connected:true,items:[]};
 // Restrict the private submission read to students on the current authorized roster.
 const submissions=await db.select({assessmentId:s.submissions.assessmentId,studentId:s.submissions.studentProfileId,status:s.submissions.status,attempt:s.submissions.attemptNumber}).from(s.submissions).where(and(
  inArray(s.submissions.assessmentId,due.map(x=>x.id)),
  inArray(s.submissions.studentProfileId,[...new Set(eligible.map(x=>x.studentId))]),
 ));
 const latest=new Map<string,(typeof submissions)[number]>();
 for(const sub of submissions){const key=sub.assessmentId+":"+sub.studentId;const prev=latest.get(key);if(!prev||sub.attempt>prev.attempt)latest.set(key,sub);}
 const items=due.flatMap(a=>eligible.filter(student=>student.sectionId===a.sectionId).flatMap(student=>{
  const sub=latest.get(a.id+":"+student.studentId);
  if(sub&&sub.status!=="assigned"&&sub.status!=="returned")return [];
  return [{assessmentId:a.id,title:a.title,course:a.course,sectionId:a.sectionId,dueAt:a.dueAt!.toISOString(),studentProfileId:student.studentId,studentName:student.studentName+" "+student.studentLastName,status:sub?.status??"not_started"}];
 })).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
 return {connected:true,items};
});

export const createMissingWorkFollowUp=createServerFn({method:"POST"})
 .validator((data:unknown)=>z.object({assessmentId:z.string().uuid(),studentProfileId:z.string().uuid()}).parse(data))
 .handler(async({data})=>{
  const context=await verifiedTeacher();
  const [{db},s,{and,eq,isNull,lt,sql,inArray}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  return db.transaction(async tx=>{
   const key="missing-work:"+data.assessmentId+":"+data.studentProfileId;
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
   const [assessment]=await tx.select({id:s.assessments.id,title:s.assessments.title,sectionId:s.assessments.sectionId,siteId:s.sections.siteId,programId:s.sections.programId,organizationId:s.programs.organizationId})
    .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
    .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(and(eq(s.assessments.id,data.assessmentId),inArray(s.assessments.status,["published","closed"]),lt(s.assessments.dueAt,new Date()))).limit(1);
   if(!assessment)throw new Error("Overdue teacher-assigned assessment not found");
   // Recheck the named teaching assignment and current CAN/church
   // institutional agreement inside the Action mutation transaction.
   await authorizeClass(context as Actor,assessment.sectionId,undefined,tx);
   const [student]=await tx.select({id:s.studentProfiles.id,personId:s.people.id,name:s.people.legalFirstName})
    .from(s.enrollments).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
    .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
    .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.studentProfiles.id,data.studentProfileId))).limit(1);
   if(!student)throw new Error("Student not actively enrolled in this section");
   const [programMembership]=await tx.select({id:s.enrollments.id})
     .from(s.enrollments).innerJoin(s.terms,
       eq(s.terms.schoolYearId,s.enrollments.schoolYearId))
     .innerJoin(s.sections,and(eq(s.sections.termId,s.terms.id),
       eq(s.sections.id,assessment.sectionId)))
     .where(and(eq(s.enrollments.studentProfileId,student.id),
       eq(s.enrollments.kind,"program"),eq(s.enrollments.status,"active"),
       eq(s.enrollments.programId,assessment.programId))).limit(1);
   if(!programMembership)throw new AuthorizationError("current active student school-year enrollment");
   const attempts=await tx.select({status:s.submissions.status,attempt:s.submissions.attemptNumber}).from(s.submissions)
    .where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,student.id)));
   const latestAttempt=attempts.reduce<(typeof attempts)[number]|undefined>(
    (latest,item)=>!latest||item.attempt>latest.attempt?item:latest,undefined);
   if(latestAttempt&&!["assigned","returned"].includes(latestAttempt.status))
    throw new Error("Work is already submitted or graded");
   const existing=await tx.select({id:s.actions.id,status:s.actions.status,metadata:s.actions.metadata}).from(s.actions)
    .where(and(eq(s.actions.type,"missing_work_follow_up"),eq(s.actions.subjectType,"student_profile"),eq(s.actions.subjectId,student.id),assessment.siteId?eq(s.actions.siteId,assessment.siteId):isNull(s.actions.siteId),eq(s.actions.programId,assessment.programId)));
   const open=existing.find(a=>a.metadata.assessmentId===assessment.id&&!["resolved","cancelled"].includes(a.status));
   if(open)return {actionId:open.id,created:false};
   const [action]=await tx.insert(s.actions).values({type:"missing_work_follow_up",status:"open",priority:"normal",title:"Follow up: "+assessment.title,description:"Missing work follow-up for "+student.name,ownerPersonId:context.actorPersonId!,organizationId:assessment.organizationId,siteId:assessment.siteId,programId:assessment.programId,subjectType:"student_profile",subjectId:student.id,dueAt:new Date(),metadata:{source:"teacher_missing_work",assessmentId:assessment.id,studentProfileId:student.id}}).returning({id:s.actions.id});
   if(!action)throw new Error("Unable to create follow-up");
   await notify(tx, {recipientPersonId:student.personId,type:"missing_work_follow_up",status:"unread",title:"Teacher follow-up: "+assessment.title,body:latestAttempt?.status==="returned"
    ?"Your teacher flagged an overdue revision. Open the returned assignment, review the feedback, and resubmit it."
    :"Your teacher flagged overdue work. Open the assignment to review and submit it.",resourceType:"action",resourceId:action.id});
   await emitEvent(tx, {eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,actorPersonId:context.actorPersonId!,payload:{assessmentId:assessment.id,studentProfileId:student.id}});
   await writeAudit(tx, {actorPersonId:context.actorPersonId!,action:"missing_work.follow_up",resourceType:"action",resourceId:action.id,scope:{siteId:assessment.siteId,programId:assessment.programId,sectionId:assessment.sectionId},after:{assessmentId:assessment.id,studentProfileId:student.id},context:{accountId:context.accountId,sessionId:context.sessionId}});
   return {actionId:action.id,created:true};
  });
 });

/** Existing route consumers can migrate without losing behavior. */
export const getSyntheticTeacherMissingWork=getTeacherMissingWork;
export const createSyntheticMissingWorkFollowUp=createMissingWorkFollowUp;
