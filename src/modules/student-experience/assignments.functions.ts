import { createServerFn } from "@tanstack/react-start";
import { and, eq, inArray, desc } from "drizzle-orm";
const STUDENT="f1000000-0000-4000-8000-000000000007";
const STUDENT_PERSON="f1000000-0000-4000-8000-000000000005";
const TEACHER="f1000000-0000-4000-8000-000000000006";
const SITE="f1000000-0000-4000-8000-000000000003";

/** Assignment flows only work on the named synthetic student and enrolled sections. */
export const getAssignments=createServerFn({method:"GET"}).handler(async()=>{
 if(!process.env.DATABASE_URL)return {connected:false,assignments:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const enrollmentRows=await db.select({sectionId:s.enrollments.sectionId})
 .from(s.enrollments).innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
 .where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.status,"active"),eq(s.enrollments.kind,"section"),eq(s.sections.siteId,SITE)));
 const ids=enrollmentRows.map(e=>e.sectionId).filter((id):id is string=>id!==null);
 if(!ids.length)return {connected:true,assignments:[]};
 const rows=await db.select({
  assessmentId:s.assessments.id,sectionId:s.assessments.sectionId,
  title:s.assessments.title,instructions:s.assessments.instructions,
  dueAt:s.assessments.dueAt,pointsPossible:s.assessments.pointsPossible,
  submissionId:s.submissions.id,status:s.submissions.status,
  timeliness:s.submissions.timeliness,submittedAt:s.submissions.submittedAt,
  gradedAt:s.submissions.gradedAt,score:s.submissions.score,
  response:s.submissions.response,feedback:s.submissions.feedback,
  course:s.sections.title,attemptNumber:s.submissions.attemptNumber,metadata:s.assessments.metadata,
 }).from(s.assessments)
 .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
 .leftJoin(s.submissions,and(eq(s.submissions.assessmentId,s.assessments.id),eq(s.submissions.studentProfileId,STUDENT)))
 .where(and(inArray(s.assessments.sectionId,ids),eq(s.assessments.status,"published")))
 .orderBy(desc(s.assessments.dueAt));
 const newest=new Map<string,(typeof rows)[number]>();
 for(const row of rows){const existing=newest.get(row.assessmentId);if(!existing||(row.attemptNumber??0)>(existing.attemptNumber??0))newest.set(row.assessmentId,row);}
 return {connected:true,assignments:[...newest.values()].map(row=>({...row,
  dueAt:row.dueAt?.toISOString()??null,submittedAt:row.submittedAt?.toISOString()??null,
  gradedAt:row.gradedAt?.toISOString()??null,
  responseText:typeof row.response?.text==="string"?row.response.text:"",
  feedbackText:typeof row.feedback?.comment==="string"?row.feedback.comment:"",
  response:undefined,feedback:undefined,
 }))};
});

export const saveAssignmentResponse=createServerFn({method:"POST"})
 .validator((value:{assessmentId:string;text:string})=>value)
 .handler(async({data})=>{
  const text=data.text.trim();
  if(text.length<3||text.length>20000)throw new Error("Response must be 3–20,000 characters");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId,dueAt:s.assessments.dueAt})
   .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),eq(s.assessments.status,"published"),eq(s.sections.siteId,SITE))).limit(1);
   if(!assessment)throw new Error("Assessment not found");
   const [enrollment]=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(
    eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.enrollments.status,"active"))).limit(1);
   if(!enrollment)throw new Error("Student is not enrolled");
   const priorRows=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,STUDENT))).orderBy(desc(s.submissions.attemptNumber)).limit(1);
   const prior=priorRows[0];
   if(prior&&prior.status!=="assigned"&&prior.status!=="returned")throw new Error("Submission is no longer editable");
   const now=new Date(),timeliness=assessment.dueAt&&now>assessment.dueAt?"late":"on_time";
   if(prior?.status==="returned"){
    const [revision]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,attemptNumber:prior.attemptNumber+1,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
    if(!revision)throw new Error("Unable to save revision");
    return {submissionId:revision.id};
   }
   if(prior){
    await tx.update(s.submissions).set({status:"submitted",response:{text},timeliness,submittedAt:now,updatedAt:now}).where(eq(s.submissions.id,prior.id));
    return {submissionId:prior.id};
   }
   const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
   if(!created)throw new Error("Unable to submit");
   return {submissionId:created.id};
  });
 });

export const gradeSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:{submissionId:string;score:number;comment:string})=>value)
 .handler(async({data})=>{
  if(!Number.isFinite(data.score)||data.score<0||data.score>100)throw new Error("Score must be from 0 to 100");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [record]=await db.select({id:s.submissions.id,points:s.assessments.pointsPossible})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.submissions.id,data.submissionId),eq(s.submissions.studentProfileId,STUDENT),eq(s.sections.siteId,SITE),eq(s.submissions.status,"submitted"))).limit(1);
  if(!record)throw new Error("Submitted work not found");
  const points=Number(record.points??100);
  const [updated]=await db.update(s.submissions).set({status:"graded",score:String(data.score*points/100),feedback:{comment:data.comment.slice(0,4000)},graderPersonId:TEACHER,gradedAt:new Date(),updatedAt:new Date()})
  .where(and(eq(s.submissions.id,record.id),eq(s.submissions.status,"submitted"))).returning({id:s.submissions.id});
  if(!updated)throw new Error("Submission already graded");
  await db.insert(s.notifications).values({recipientPersonId:STUDENT_PERSON,type:"assignment_feedback",status:"unread",title:"New feedback on your work",body:data.comment.slice(0,500)||"Your teacher posted a grade.",resourceType:"submission",resourceId:updated.id});
  return {submissionId:updated.id};
 });

export const returnSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:{submissionId:string})=>value)
 .handler(async({data})=>{
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [updated]=await db.update(s.submissions).set({status:"returned",returnedAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.submissions.id,data.submissionId),eq(s.submissions.studentProfileId,STUDENT),eq(s.submissions.status,"graded"))).returning({id:s.submissions.id});
  if(!updated)throw new Error("Graded synthetic submission not found");
  return {submissionId:updated.id};
 });
