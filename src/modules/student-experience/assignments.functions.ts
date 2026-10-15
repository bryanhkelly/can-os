import { assertSyntheticMutation } from "./demo-write-gate";
import { readRubric, scoreRubric, type CriterionGrade } from "./rubric";
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
  course:s.sections.title,attemptNumber:s.submissions.attemptNumber,metadata:s.assessments.metadata,assessmentStatus:s.assessments.status,
 }).from(s.assessments)
 .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
 .leftJoin(s.submissions,and(eq(s.submissions.assessmentId,s.assessments.id),eq(s.submissions.studentProfileId,STUDENT)))
 .where(and(inArray(s.assessments.sectionId,ids),inArray(s.assessments.status,["published","closed"])))
 .orderBy(desc(s.assessments.dueAt));
 const newest=new Map<string,(typeof rows)[number]>();
 for(const row of rows){const existing=newest.get(row.assessmentId);if(!existing||(row.attemptNumber??0)>(existing.attemptNumber??0))newest.set(row.assessmentId,row);}
 return {connected:true,assignments:[...newest.values()].map(row=>({...row,
  attempts:rows.filter(item=>item.assessmentId===row.assessmentId).map(item=>({attempt:item.attemptNumber??1,status:item.status??"assigned",score:item.score,submittedAt:item.submittedAt?.toISOString()??null,feedback:typeof item.feedback?.comment==="string"?item.feedback.comment:""})),
  dueAt:row.dueAt?.toISOString()??null,submittedAt:row.submittedAt?.toISOString()??null,
  gradedAt:row.gradedAt?.toISOString()??null,
  metadata:{rubric:typeof row.metadata.rubric==="string"?row.metadata.rubric:"",criteria:readRubric(row.metadata.rubricCriteria),synthetic:row.metadata.synthetic===true},
  rubricResult:row.feedback?.rubricResult??null,
  responseText:typeof row.response?.text==="string"?row.response.text:"",
  feedbackText:typeof row.feedback?.comment==="string"?row.feedback.comment:"",
  response:undefined,feedback:undefined,
 }))};
});

export const saveAssignmentResponse=createServerFn({method:"POST"})
 .validator((value:{assessmentId:string;text:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("student");
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
   const priorRows=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,STUDENT))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   const prior=priorRows[0];
   if(prior&&prior.status!=="assigned"&&prior.status!=="returned")throw new Error("Submission is no longer editable");
   const now=new Date(),timeliness=assessment.dueAt&&now>assessment.dueAt?"late":"on_time";
   if(prior?.status==="returned"){
    const [revision]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,attemptNumber:prior.attemptNumber+1,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
    if(!revision)throw new Error("Unable to save revision");
    return {submissionId:revision.id};
   }
   if(prior){
    const [submitted]=await tx.update(s.submissions).set({status:"submitted",response:{text},timeliness,submittedAt:now,updatedAt:now}).where(and(eq(s.submissions.id,prior.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!submitted)throw new Error("Assignment was submitted or changed in another tab");
    return {submissionId:submitted.id};
   }
   const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
   if(!created)throw new Error("Unable to submit");
   return {submissionId:created.id};
  });
 });

export const gradeSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:{submissionId:string;score:number;comment:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
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
  assertSyntheticMutation("teacher");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [updated]=await db.update(s.submissions).set({status:"returned",returnedAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.submissions.id,data.submissionId),eq(s.submissions.studentProfileId,STUDENT),eq(s.submissions.status,"graded"))).returning({id:s.submissions.id});
  if(!updated)throw new Error("Graded synthetic submission not found");
  return {submissionId:updated.id};
 });

/** Create and publish a synthetic class assignment using the existing model. */
export const createSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:{sectionId:string;title:string;instructions:string;dueAt:string;pointsPossible:number;rubric:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  if(data.title.trim().length<3||data.title.length>180)throw new Error("Title must be 3–180 characters");
  if(!Number.isFinite(data.pointsPossible)||data.pointsPossible<=0||data.pointsPossible>1000)throw new Error("Invalid point value");
  const dueAt=new Date(data.dueAt);
  if(Number.isNaN(dueAt.getTime()))throw new Error("Invalid due date");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [section]=await tx.select({id:s.sections.id}).from(s.sections).where(and(eq(s.sections.id,data.sectionId),eq(s.sections.siteId,SITE))).limit(1);
   if(!section)throw new Error("Section not found at synthetic Site");
   const [assessment]=await tx.insert(s.assessments).values({
    sectionId:section.id,title:data.title.trim(),instructions:data.instructions.trim(),
    status:"published",pointsPossible:String(data.pointsPossible),dueAt,availableAt:new Date(),
    createdByPersonId:TEACHER,metadata:{synthetic:true,fixture:"gf1-v2",rubric:data.rubric.trim()},
   }).returning({id:s.assessments.id});
   if(!assessment)throw new Error("Assessment could not be created");
   const enrolled=await tx.select({studentProfileId:s.enrollments.studentProfileId}).from(s.enrollments).where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.sectionId,section.id),eq(s.enrollments.status,"active")));
   if(enrolled.length)await tx.insert(s.submissions).values(enrolled.map(row=>({assessmentId:assessment.id,studentProfileId:row.studentProfileId,status:"assigned" as const,timeliness:"on_time" as const})));
   return {assessmentId:assessment.id};
  });
 });

export const getSyntheticAssignmentHistory=createServerFn({method:"GET"})
 .validator((value:{assessmentId:string})=>value)
 .handler(async({data})=>{
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const rows=await db.select({attempt:s.submissions.attemptNumber,status:s.submissions.status,
   submittedAt:s.submissions.submittedAt,score:s.submissions.score,
   response:s.submissions.response,feedback:s.submissions.feedback})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.submissions.assessmentId,data.assessmentId),eq(s.submissions.studentProfileId,STUDENT),eq(s.sections.siteId,SITE)))
   .orderBy(desc(s.submissions.attemptNumber));
  return rows.map(row=>({attempt:row.attempt,status:row.status,
   submittedAt:row.submittedAt?.toISOString()??null,score:row.score,
   text:typeof row.response.text==="string"?row.response.text:"",
   feedback:typeof row.feedback.comment==="string"?row.feedback.comment:""}));
 });

/** Drafts remain in the existing response JSON on an assigned attempt. */
export const saveSyntheticAssignmentDraft=createServerFn({method:"POST"})
 .validator((value:{assessmentId:string;text:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  if(data.text.length>20000)throw new Error("Draft too long");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId})
    .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .where(and(eq(s.assessments.id,data.assessmentId),eq(s.sections.siteId,SITE),eq(s.assessments.status,"published"))).limit(1);
   if(!assessment)throw new Error("Assignment not available");
   const [enrollment]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
    .where(and(eq(s.enrollments.studentProfileId,STUDENT),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.enrollments.status,"active"))).limit(1);
   if(!enrollment)throw new Error("Student not enrolled");
   const [latest]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,STUDENT))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   if(latest && !["assigned","returned"].includes(latest.status))throw new Error("Submitted work cannot be overwritten");
   if(latest?.status==="returned"){
    const [draft]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,attemptNumber:latest.attemptNumber+1,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing().returning({id:s.submissions.id});
    if(draft)return {saved:true};
    const [existing]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,STUDENT),eq(s.submissions.attemptNumber,latest.attemptNumber+1))).limit(1);
    if(!existing||existing.status!=="assigned")throw new Error("Revision already submitted");
    const [saved]=await tx.update(s.submissions).set({response:{text:data.text,draft:true},updatedAt:new Date()}).where(and(eq(s.submissions.id,existing.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
    return {saved:true};
   }
   if(latest){
    const [saved]=await tx.update(s.submissions).set({response:{text:data.text,draft:true},updatedAt:new Date()}).where(and(eq(s.submissions.id,latest.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
   }else{
    await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:STUDENT,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing();
   }
   return {saved:true};
  });
 });

export const manageSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:{assessmentId:string;action:"close"|"reopen"|"reschedule";dueAt?:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [assessment]=await db.select({id:s.assessments.id,metadata:s.assessments.metadata})
   .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),eq(s.sections.siteId,SITE))).limit(1);
  if(!assessment||assessment.metadata.synthetic!==true)throw new Error("Only synthetic assignments can be managed");
  const due=data.action==="reschedule"?new Date(data.dueAt??""):undefined;
  if(due&&Number.isNaN(due.getTime()))throw new Error("Invalid due date");
  await db.update(s.assessments).set({
   ...(data.action==="close"?{status:"closed" as const}:data.action==="reopen"?{status:"published" as const}:{}),
   ...(due?{dueAt:due}:{}),updatedAt:new Date(),
  }).where(eq(s.assessments.id,assessment.id));
  return {saved:true};
 });

/** Teacher grades a submitted synthetic attempt against the published rubric. */
export const gradeSyntheticRubric=createServerFn({method:"POST"})
 .validator((value:{submissionId:string;grades:CriterionGrade[];comment:string})=>value)
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [record]=await tx.select({id:s.submissions.id,points:s.assessments.pointsPossible,metadata:s.assessments.metadata})
    .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
    .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .where(and(eq(s.submissions.id,data.submissionId),eq(s.submissions.studentProfileId,STUDENT),
       eq(s.sections.siteId,SITE),eq(s.submissions.status,"submitted"))).limit(1);
   if(!record||record.metadata.synthetic!==true)throw new Error("Synthetic submitted assignment not found");
   const criteria=readRubric(record.metadata.rubricCriteria);
   const result=scoreRubric(criteria,data.grades);
   const possible=Number(record.points??100);
   const [updated]=await tx.update(s.submissions).set({
    status:"graded",score:String(Math.round(result.percentage*possible)/100),
    feedback:{comment:data.comment.slice(0,4000),rubricResult:{...result,grades:data.grades,criteria}},
    graderPersonId:TEACHER,gradedAt:new Date(),updatedAt:new Date()
   }).where(and(eq(s.submissions.id,record.id),eq(s.submissions.status,"submitted")))
     .returning({id:s.submissions.id});
   if(!updated)throw new Error("Submission already graded");
   await tx.insert(s.notifications).values({recipientPersonId:STUDENT_PERSON,
    type:"assignment_feedback",status:"unread",title:"Your rubric feedback is ready",
    body:data.comment.slice(0,500)||"Your teacher scored your assignment rubric.",
    resourceType:"submission",resourceId:updated.id});
   return {submissionId:updated.id,...result};
  });
 });
