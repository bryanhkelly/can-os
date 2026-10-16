import { assertSyntheticMutation } from "./demo-write-gate";
import { readRubric, scoreRubric, type CriterionGrade } from "./rubric";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, assertSiteScope, AuthorizationError } from "@/domain/command-context";
import { and, eq, inArray, desc, sql } from "drizzle-orm";


/** Never accept a browser-selected actor or role for assignment authorization. */
async function studentActor(){
 const context=await getCommandContext(getRequest());
 assertCapability(context,"assignments:submit");
 if(!context.scope.siteIds?.length)throw new AuthorizationError("student site membership");
 if(context.role!=="student"||!context.actorPersonId)throw new AuthorizationError("student assignment access");
 const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [profile]=await db.select({id:schema.studentProfiles.id}).from(schema.studentProfiles)
  .where(eq(schema.studentProfiles.personId,context.actorPersonId)).limit(1);
 if(!profile)throw new AuthorizationError("student profile");
 return {context,studentId:profile.id,studentPersonId:context.actorPersonId};
}
async function teacherActor(sectionId?:string){
 const context=await getCommandContext(getRequest());
 if(context.role!=="teacher"||!context.actorPersonId)throw new AuthorizationError("teacher assignment access");
 if(!context.scope.siteIds?.length)throw new AuthorizationError("teacher site membership");
 const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 if(sectionId){
  const [section]=await db.select({siteId:schema.sections.siteId})
   .from(schema.sectionTeachers).innerJoin(schema.sections,eq(schema.sections.id,schema.sectionTeachers.sectionId))
   .where(and(eq(schema.sectionTeachers.personId,context.actorPersonId),eq(schema.sectionTeachers.sectionId,sectionId))).limit(1);
  if(!section)throw new AuthorizationError("assigned teacher");
  assertSiteScope(context,section.siteId);
 }
 return context;
}
async function teacherForSubmission(submissionId:string){
 const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [row]=await db.select({sectionId:schema.assessments.sectionId})
  .from(schema.submissions).innerJoin(schema.assessments,eq(schema.assessments.id,schema.submissions.assessmentId))
  .where(eq(schema.submissions.id,submissionId)).limit(1);
 if(!row||!row.sectionId)throw new AuthorizationError("submission section");
 return teacherActor(row.sectionId);
}
async function teacherForAssessment(assessmentId:string){
 const [{db},schema]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [row]=await db.select({sectionId:schema.assessments.sectionId})
  .from(schema.assessments).where(eq(schema.assessments.id,assessmentId)).limit(1);
 if(!row||!row.sectionId)throw new AuthorizationError("assessment section");
 return teacherActor(row.sectionId);
}
/** Assignment flows are scoped to an authenticated student and active enrollments. */
export const getAssignments=createServerFn({method:"GET"}).handler(async()=>{
 const {context,studentId}=await studentActor();
 if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
 if(!process.env.DATABASE_URL)return {connected:false,assignments:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const enrollmentRows=await db.select({sectionId:s.enrollments.sectionId})
 .from(s.enrollments).innerJoin(s.sections,eq(s.sections.id,s.enrollments.sectionId))
 .where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.status,"active"),eq(s.enrollments.kind,"section"),inArray(s.sections.siteId,context.scope.siteIds!)));
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
 .leftJoin(s.submissions,and(eq(s.submissions.assessmentId,s.assessments.id),eq(s.submissions.studentProfileId,studentId)))
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
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1),text:z.string()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  const {context,studentId,studentPersonId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const text=data.text.trim();
  if(text.length<3||text.length>20000)throw new Error("Response must be 3–20,000 characters");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId,dueAt:s.assessments.dueAt,metadata:s.assessments.metadata})
   .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),eq(s.assessments.status,"published"),inArray(s.sections.siteId,context.scope.siteIds!))).limit(1);
   if(!assessment||assessment.metadata.synthetic!==true)throw new Error("Synthetic assessment not found");
   // Serialize this student/assessment across draft and final submission requests, 
   // including when no submission row exists to lock yet.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${assessment.id}))`);
   const [enrollment]=await tx.select({id:s.enrollments.id}).from(s.enrollments).where(and(
    eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.enrollments.status,"active"))).limit(1);
   if(!enrollment)throw new Error("Student is not enrolled");
   const priorRows=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   const prior=priorRows[0];
   if(prior&&prior.status!=="assigned"&&prior.status!=="returned")throw new Error("Submission is no longer editable");
   const now=new Date(),timeliness=assessment.dueAt&&now>assessment.dueAt?"late":"on_time";
   const resolveFollowUps=async(submissionId:string)=>{
    const rows=await tx.select({id:s.actions.id,status:s.actions.status,metadata:s.actions.metadata}).from(s.actions)
     .where(and(eq(s.actions.type,"missing_work_follow_up"),eq(s.actions.subjectType,"student_profile"),eq(s.actions.subjectId,studentId),inArray(s.actions.siteId,context.scope.siteIds!)));
    for(const action of rows){
     if(action.metadata.synthetic!==true||action.metadata.assessmentId!==assessment.id||action.status==="resolved"||action.status==="cancelled")continue;
     await tx.update(s.actions).set({status:"resolved",resolvedAt:now,resolutionNote:"Student submitted overdue assignment.",updatedAt:now}).where(eq(s.actions.id,action.id));
     await tx.insert(s.auditEvents).values({actorPersonId:studentPersonId,action:"synthetic.missing_work.resolved_by_submission",resourceType:"action",resourceId:action.id,before:{status:action.status},after:{status:"resolved",submissionId},context:{synthetic:true,assessmentId:assessment.id}});
    }
   };

   if(prior?.status==="returned"){
    const [revision]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,attemptNumber:prior.attemptNumber+1,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
    if(!revision)throw new Error("Unable to save revision");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.submit_revision",resourceType:"submission",resourceId:revision.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
    await resolveFollowUps(revision.id);
    return {submissionId:revision.id};
   }
   if(prior){
    const [submitted]=await tx.update(s.submissions).set({status:"submitted",response:{text},timeliness,submittedAt:now,updatedAt:now}).where(and(eq(s.submissions.id,prior.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!submitted)throw new Error("Assignment was submitted or changed in another tab");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.submit",resourceType:"submission",resourceId:submitted.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
    await resolveFollowUps(submitted.id);
    return {submissionId:submitted.id};
   }
   const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
   if(!created)throw new Error("Unable to submit");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.submit",resourceType:"submission",resourceId:created.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
    await resolveFollowUps(created.id);
   return {submissionId:created.id};
  });
 });

export const gradeSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({submissionId:z.string().min(1),score:z.number().finite().min(0).max(100),comment:z.string()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const context=await teacherActor();
  assertCapability(context,"assignments:grade");
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  if(!Number.isFinite(data.score)||data.score<0||data.score>100)throw new Error("Score must be from 0 to 100");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await teacherForSubmission(data.submissionId);
  return db.transaction(async tx=>{
  const [record]=await tx.select({id:s.submissions.id,points:s.assessments.pointsPossible,studentProfileId:s.submissions.studentProfileId,metadata:s.assessments.metadata})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
   .where(and(eq(s.submissions.id,data.submissionId),inArray(s.sections.siteId,context.scope.siteIds!),eq(s.submissions.status,"submitted"))).limit(1);
  if(!record||record.metadata.synthetic!==true)throw new Error("Synthetic submitted work not found");
  const [student]=await tx.select({personId:s.studentProfiles.personId}).from(s.studentProfiles).where(eq(s.studentProfiles.id,record.studentProfileId)).limit(1);
  if(!student)throw new AuthorizationError("student profile");
  const studentPersonId=student.personId;
  const points=Number(record.points??100);
  const [updated]=await tx.update(s.submissions).set({status:"graded",score:String(data.score*points/100),feedback:{comment:data.comment.slice(0,4000)},graderPersonId:context.actorPersonId,gradedAt:new Date(),updatedAt:new Date()})
  .where(and(eq(s.submissions.id,record.id),eq(s.submissions.status,"submitted"))).returning({id:s.submissions.id});
  if(!updated)throw new Error("Submission already graded");
  await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.grade",resourceType:"submission",resourceId:updated.id,before:{status:"submitted"},after:{status:"graded",score:data.score},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
  await tx.insert(s.notifications).values({recipientPersonId:studentPersonId,type:"assignment_feedback",status:"unread",title:"New feedback on your work",body:data.comment.slice(0,500)||"Your teacher posted a grade.",resourceType:"submission",resourceId:updated.id});
  return {submissionId:updated.id};
  });
 });

export const returnSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({submissionId:z.string().min(1)}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const context=await teacherActor();
  assertCapability(context,"assignments:grade");
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await teacherForSubmission(data.submissionId);
  return db.transaction(async tx=>{
  const [record]=await tx.select({metadata:s.assessments.metadata})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
   .where(and(eq(s.submissions.id,data.submissionId),inArray(s.sections.siteId,context.scope.siteIds!))).limit(1);
  if(!record||record.metadata.synthetic!==true)throw new Error("Synthetic graded submission not found");
  const [updated]=await tx.update(s.submissions).set({status:"returned",returnedAt:new Date(),updatedAt:new Date()})
   .where(and(eq(s.submissions.id,data.submissionId),eq(s.submissions.status,"graded"))).returning({id:s.submissions.id});
  if(!updated)throw new Error("Graded synthetic submission not found");
  await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.return",resourceType:"submission",resourceId:updated.id,before:{status:"graded"},after:{status:"returned"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
  const [recipient]=await tx.select({personId:s.studentProfiles.personId})
   .from(s.submissions).innerJoin(s.studentProfiles,eq(s.studentProfiles.id,s.submissions.studentProfileId))
   .where(eq(s.submissions.id,updated.id)).limit(1);
  if(!recipient)throw new Error("Student profile missing for returned assignment");
  await tx.insert(s.notifications).values({recipientPersonId:recipient.personId,type:"assignment_feedback",status:"unread",title:"Assignment returned for revision",body:"Your teacher returned your work. Review the feedback and submit a revision.",resourceType:"submission",resourceId:updated.id});
  return {submissionId:updated.id};
  });
 });

/** Create and publish a synthetic class assignment using the existing model. */
export const createSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({sectionId:z.string().min(1),title:z.string(),instructions:z.string(),dueAt:z.string(),pointsPossible:z.number().finite().positive().max(1000),rubric:z.string()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const context=await teacherActor();
  assertCapability(context,"assignments:create");
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  if(data.title.trim().length<3||data.title.length>180)throw new Error("Title must be 3–180 characters");
  if(!Number.isFinite(data.pointsPossible)||data.pointsPossible<=0||data.pointsPossible>1000)throw new Error("Invalid point value");
  const dueAt=new Date(data.dueAt);
  if(Number.isNaN(dueAt.getTime()))throw new Error("Invalid due date");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await teacherActor(data.sectionId);
  return db.transaction(async tx=>{
   const [section]=await tx.select({id:s.sections.id}).from(s.sections)
    .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(and(eq(s.sections.id,data.sectionId),inArray(s.sections.siteId,context.scope.siteIds!))).limit(1);
   if(!section)throw new Error("Section not found at synthetic Site");
   const [assessment]=await tx.insert(s.assessments).values({
    sectionId:section.id,title:data.title.trim(),instructions:data.instructions.trim(),
    status:"published",pointsPossible:String(data.pointsPossible),dueAt,availableAt:new Date(),
    createdByPersonId:context.actorPersonId!,metadata:{synthetic:true,fixture:"gf1-v2",rubric:data.rubric.trim()},
   }).returning({id:s.assessments.id});
   if(!assessment)throw new Error("Assessment could not be created");
   await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.create",resourceType:"assessment",resourceId:assessment.id,after:{status:"published"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
   const enrolled=await tx.select({studentProfileId:s.enrollments.studentProfileId}).from(s.enrollments).where(and(eq(s.enrollments.kind,"section"),eq(s.enrollments.sectionId,section.id),eq(s.enrollments.status,"active")));
   if(enrolled.length)await tx.insert(s.submissions).values(enrolled.map(row=>({assessmentId:assessment.id,studentProfileId:row.studentProfileId,status:"assigned" as const,timeliness:"on_time" as const})));
   return {assessmentId:assessment.id};
  });
 });

export const getSyntheticAssignmentHistory=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1)}).parse(value))
 .handler(async({data})=>{
  const {context,studentId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const rows=await db.select({attempt:s.submissions.attemptNumber,status:s.submissions.status,
   submittedAt:s.submissions.submittedAt,score:s.submissions.score,
   response:s.submissions.response,feedback:s.submissions.feedback})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.submissions.assessmentId,data.assessmentId),eq(s.submissions.studentProfileId,studentId),inArray(s.sections.siteId,context.scope.siteIds!)))
   .orderBy(desc(s.submissions.attemptNumber));
  return rows.map(row=>({attempt:row.attempt,status:row.status,
   submittedAt:row.submittedAt?.toISOString()??null,score:row.score,
   text:typeof row.response?.text==="string"?row.response.text:"",
   feedback:typeof row.feedback?.comment==="string"?row.feedback.comment:""}));
 });

/** Drafts remain in the existing response JSON on an assigned attempt. */
export const saveSyntheticAssignmentDraft=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1),text:z.string()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("student");
  const {context,studentId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  if(data.text.length>20000)throw new Error("Draft too long");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId,metadata:s.assessments.metadata})
    .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .where(and(eq(s.assessments.id,data.assessmentId),inArray(s.sections.siteId,context.scope.siteIds!),eq(s.assessments.status,"published"))).limit(1);
   if(!assessment||assessment.metadata.synthetic!==true)throw new Error("Synthetic assignment not available");
   // Serialize this student/assessment across draft and final submission requests, 
   // including when no submission row exists to lock yet.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${assessment.id}))`);
   const [enrollment]=await tx.select({id:s.enrollments.id}).from(s.enrollments)
    .where(and(eq(s.enrollments.studentProfileId,studentId),eq(s.enrollments.sectionId,assessment.sectionId),eq(s.enrollments.status,"active"))).limit(1);
   if(!enrollment)throw new Error("Student not enrolled");
   const [latest]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   if(latest && !["assigned","returned"].includes(latest.status))throw new Error("Submitted work cannot be overwritten");
   if(latest?.status==="returned"){
    const [draft]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,attemptNumber:latest.attemptNumber+1,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing().returning({id:s.submissions.id});
    if(draft){await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.draft_revision",resourceType:"submission",resourceId:draft.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});return {saved:true};}
    const [existing]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId),eq(s.submissions.attemptNumber,latest.attemptNumber+1))).limit(1);
    if(!existing||existing.status!=="assigned")throw new Error("Revision already submitted");
    const [saved]=await tx.update(s.submissions).set({response:{text:data.text,draft:true},updatedAt:new Date()}).where(and(eq(s.submissions.id,existing.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:saved.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
    return {saved:true};
   }
   if(latest){
    const [saved]=await tx.update(s.submissions).set({response:{text:data.text,draft:true},updatedAt:new Date()}).where(and(eq(s.submissions.id,latest.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:saved.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
   }else{
    const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing().returning({id:s.submissions.id});
    if(!created)throw new Error("Assignment draft changed in another tab; refresh before saving");
    await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:created.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
   }
   return {saved:true};
  });
 });

export const manageSyntheticAssignment=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1),action:z.enum(["close","reopen","reschedule"]),dueAt:z.string().optional()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const context=await teacherActor();
  assertCapability(context,"assignments:create");
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await teacherForAssessment(data.assessmentId);
  const [assessment]=await db.select({id:s.assessments.id,metadata:s.assessments.metadata})
   .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),inArray(s.sections.siteId,context.scope.siteIds!))).limit(1);
  if(!assessment||assessment.metadata.synthetic!==true)throw new Error("Only synthetic assignments can be managed");
  const due=data.action==="reschedule"?new Date(data.dueAt??""):undefined;
  if(due&&Number.isNaN(due.getTime()))throw new Error("Invalid due date");
  await db.transaction(async tx=>{
   const [authorized]=await tx.select({id:s.assessments.id,metadata:s.assessments.metadata})
    .from(s.assessments)
    .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(and(eq(s.assessments.id,assessment.id),inArray(s.sections.siteId,context.scope.siteIds!))).limit(1);
   if(!authorized||authorized.metadata.synthetic!==true)throw new AuthorizationError("assigned synthetic assessment");
   const [updated]=await tx.update(s.assessments).set({
    ...(data.action==="close"?{status:"closed" as const}:data.action==="reopen"?{status:"published" as const}:{}),
    ...(due?{dueAt:due}:{}),updatedAt:new Date(),
   }).where(eq(s.assessments.id,assessment.id)).returning({id:s.assessments.id});
   if(!updated)throw new Error("Assessment unavailable");
   await tx.insert(s.auditEvents).values({
    actorPersonId:context.actorPersonId,action:"assignment."+data.action,
    resourceType:"assessment",resourceId:updated.id,
    after:{action:data.action,dueAt:due?.toISOString()??null},
    context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true},
   });
  });
  return {saved:true};
 });

/** Teacher grades a submitted synthetic attempt against the published rubric. */
export const gradeSyntheticRubric=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({submissionId:z.string().min(1),grades:z.array(z.object({id:z.string().min(1),points:z.number().finite().min(0),comment:z.string().optional()})),comment:z.string()}).parse(value))
 .handler(async({data})=>{
  assertSyntheticMutation("teacher");
  const context=await teacherActor();
  assertCapability(context,"assignments:grade");
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  await teacherForSubmission(data.submissionId);
  return db.transaction(async tx=>{
   const [record]=await tx.select({id:s.submissions.id,points:s.assessments.pointsPossible,metadata:s.assessments.metadata,studentProfileId:s.submissions.studentProfileId})
    .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
    .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .innerJoin(s.sectionTeachers,and(eq(s.sectionTeachers.sectionId,s.sections.id),eq(s.sectionTeachers.personId,context.actorPersonId!)))
    .where(and(eq(s.submissions.id,data.submissionId),inArray(s.sections.siteId,context.scope.siteIds!),eq(s.submissions.status,"submitted"))).limit(1);
   if(!record||record.metadata.synthetic!==true)throw new Error("Synthetic submitted assignment not found");
   const [student]=await tx.select({personId:s.studentProfiles.personId}).from(s.studentProfiles).where(eq(s.studentProfiles.id,record.studentProfileId)).limit(1);
   if(!student)throw new AuthorizationError("student profile");
   const studentPersonId=student.personId;
   const criteria=readRubric(record.metadata.rubricCriteria);
   const result=scoreRubric(criteria,data.grades);
   const possible=Number(record.points??100);
   const [updated]=await tx.update(s.submissions).set({
    status:"graded",score:String(Math.round(result.percentage*possible)/100),
    feedback:{comment:data.comment.slice(0,4000),rubricResult:{...result,grades:data.grades,criteria}},
    graderPersonId:context.actorPersonId,gradedAt:new Date(),updatedAt:new Date()
   }).where(and(eq(s.submissions.id,record.id),eq(s.submissions.status,"submitted")))
     .returning({id:s.submissions.id});
   if(!updated)throw new Error("Submission already graded");
   await tx.insert(s.auditEvents).values({actorPersonId:context.actorPersonId,action:"assignment.rubric_grade",resourceType:"submission",resourceId:updated.id,before:{status:"submitted"},after:{status:"graded",score:result.percentage},context:{accountId:context.accountId,sessionId:context.sessionId,synthetic:true}});
   await tx.insert(s.notifications).values({recipientPersonId:studentPersonId,
    type:"assignment_feedback",status:"unread",title:"Your rubric feedback is ready",
    body:data.comment.slice(0,500)||"Your teacher scored your assignment rubric.",
    resourceType:"submission",resourceId:updated.id});
   return {submissionId:updated.id,...result};
  });
 });
