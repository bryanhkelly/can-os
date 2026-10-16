import {createServerFn} from "@tanstack/react-start";
import {getRequest} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {assertCapability,assertSiteScope,AuthorizationError} from "@/domain/command-context";
import {and,eq,inArray,lt} from "drizzle-orm";
const TEACHER="f1000000-0000-4000-8000-000000000006";
const SITE="f1000000-0000-4000-8000-000000000003";
async function assertDemoTeacher(){
 const context=await getCommandContext(getRequest());
 if(context.role!=="teacher"||context.actorPersonId!==TEACHER)throw new AuthorizationError("demo teacher identity required");
 assertCapability(context,"assignments:grade");
 assertSiteScope(context,SITE);
 return context;
}

/** A real enrolled-roster queue restricted to synthetic students in the demo teacher's assigned sections. */
export const getSyntheticTeacherMissingWork=createServerFn({method:"GET"}).handler(async()=>{
 await assertDemoTeacher();
 if(!process.env.DATABASE_URL)return {connected:false,items:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const assigned=await db.select({sectionId:s.sectionTeachers.sectionId}).from(s.sectionTeachers)
  .innerJoin(s.sections,and(eq(s.sections.id,s.sectionTeachers.sectionId),eq(s.sections.siteId,SITE)))
  .where(eq(s.sectionTeachers.personId,TEACHER));
 const sectionIds=[...new Set(assigned.map(x=>x.sectionId))];
 if(!sectionIds.length)return {connected:true,items:[]};
 const now=new Date();
 const due=await db.select({id:s.assessments.id,title:s.assessments.title,dueAt:s.assessments.dueAt,sectionId:s.assessments.sectionId,course:s.sections.title}).from(s.assessments)
  .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
  .where(and(inArray(s.assessments.sectionId,sectionIds),inArray(s.assessments.status,["published","closed"]),lt(s.assessments.dueAt,now)));
 if(!due.length)return {connected:true,items:[]};
 const roster=await db.select({sectionId:s.enrollments.sectionId,studentId:s.studentProfiles.id,studentName:s.people.legalFirstName,studentLastName:s.people.legalLastName,studentSynthetic:s.people.metadata}).from(s.enrollments)
  .innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
  .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),inArray(s.enrollments.sectionId,sectionIds)));
 const eligible=roster.filter(x=>x.studentSynthetic.synthetic===true);
 const submissions=await db.select({assessmentId:s.submissions.assessmentId,studentId:s.submissions.studentProfileId,status:s.submissions.status,attempt:s.submissions.attemptNumber}).from(s.submissions).where(inArray(s.submissions.assessmentId,due.map(x=>x.id)));
 const latest=new Map<string,(typeof submissions)[number]>();
 for(const sub of submissions){const key=sub.assessmentId+":"+sub.studentId;const prev=latest.get(key);if(!prev||sub.attempt>prev.attempt)latest.set(key,sub);}
 const items=due.flatMap(a=>eligible.filter(student=>student.sectionId===a.sectionId).flatMap(student=>{
  const sub=latest.get(a.id+":"+student.studentId);
  if(sub&&sub.status!=="assigned")return [];
  return [{assessmentId:a.id,title:a.title,course:a.course,sectionId:a.sectionId,dueAt:a.dueAt!.toISOString(),studentProfileId:student.studentId,studentName:student.studentName+" "+student.studentLastName,status:sub?.status??"not_started"}];
 })).sort((a,b)=>a.dueAt.localeCompare(b.dueAt));
 return {connected:true,items};
});

export const createSyntheticMissingWorkFollowUp=createServerFn({method:"POST"})
 .validator((data:{assessmentId:string;studentProfileId:string})=>data)
 .handler(async({data})=>{
  const {assertSyntheticMutation}=await import("./demo-write-gate");
  assertSyntheticMutation("teacher");
  await assertDemoTeacher();
  const [{db},s,{and,eq,lt,sql,inArray}]=await Promise.all([import("@/db/client"),import("@/db/schema"),import("drizzle-orm")]);
  return db.transaction(async tx=>{
   const key="missing-work:"+data.assessmentId+":"+data.studentProfileId;
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
   const [assessment]=await tx.select({id:s.assessments.id,title:s.assessments.title,sectionId:s.assessments.sectionId,organizationId:s.programs.organizationId})
    .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .innerJoin(s.programs,eq(s.programs.id,s.sections.programId))
    .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,TEACHER)))
    .where(and(eq(s.assessments.id,data.assessmentId),eq(s.sections.siteId,SITE),inArray(s.assessments.status,["published","closed"]),lt(s.assessments.dueAt,new Date()))).limit(1);
   if(!assessment)throw new Error("Overdue teacher-assigned assessment not found");
   const [student]=await tx.select({id:s.studentProfiles.id,personId:s.people.id,name:s.people.legalFirstName,metadata:s.people.metadata})
    .from(s.enrollments).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.enrollments.studentProfileId))
    .innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
    .where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.status,"active"),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.studentProfiles.id,data.studentProfileId))).limit(1);
   if(!student||student.metadata.synthetic!==true)throw new Error("Synthetic student not actively enrolled");
   const attempts=await tx.select({status:s.submissions.status}).from(s.submissions)
    .where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,student.id)));
   if(attempts.some(a=>a.status!=="assigned"))throw new Error("Work has already been submitted");
   const existing=await tx.select({id:s.actions.id,status:s.actions.status,metadata:s.actions.metadata}).from(s.actions)
    .where(and(eq(s.actions.type,"missing_work_follow_up"),eq(s.actions.subjectType,"student_profile"),eq(s.actions.subjectId,student.id),eq(s.actions.siteId,SITE)));
   const open=existing.find(a=>a.metadata.synthetic===true&&a.metadata.assessmentId===assessment.id&&!["resolved","cancelled"].includes(a.status));
   if(open)return {actionId:open.id,created:false};
   const [action]=await tx.insert(s.actions).values({type:"missing_work_follow_up",status:"open",priority:"normal",title:"Follow up: "+assessment.title,description:"Missing work follow-up for "+student.name,ownerPersonId:TEACHER,organizationId:assessment.organizationId,siteId:SITE,subjectType:"student_profile",subjectId:student.id,dueAt:new Date(),metadata:{synthetic:true,fixture:"gf1",assessmentId:assessment.id,studentProfileId:student.id}}).returning({id:s.actions.id});
   if(!action)throw new Error("Unable to create follow-up");
   await tx.insert(s.notifications).values({recipientPersonId:student.personId,type:"missing_work_follow_up",status:"unread",title:"Teacher follow-up: "+assessment.title,body:"Your teacher flagged overdue work. Open the assignment to review and submit it.",resourceType:"action",resourceId:action.id});
   await tx.insert(s.auditEvents).values({actorPersonId:TEACHER,action:"synthetic.missing_work.follow_up",resourceType:"action",resourceId:action.id,after:{assessmentId:assessment.id,studentProfileId:student.id},context:{synthetic:true}});
   return {actionId:action.id,created:true};
  });
 });
