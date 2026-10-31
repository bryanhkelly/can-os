import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { authorizeClass,accessibleClasses } from "@/modules/learning/class-access.server";
import type { Actor } from "@/modules/identity/actors.server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { createAssessment,gradeSubmission,manageAssessment,returnSubmissionForRevision } from "@/modules/learning/gradebook.functions";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and,desc,eq,inArray,sql } from "drizzle-orm";
import { z } from "zod";
import { readRubric,scoreRubric } from "@/modules/learning/rubric";
import { assessmentAttemptLimit, assertAssessmentAttemptAllowed } from "@/domain/assessment-attempt-policy";
import { assessmentAvailability, assertAssessmentActionable } from "@/domain/assessment-availability";
import { writtenSubmissionResponse } from "@/domain/submission-response";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";


import { EventTypes } from "@/domain/event-types";
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
 if(!context.scope.siteIds?.length&&!context.scope.sectionIds?.length)
  throw new AuthorizationError("assigned teacher Site or named Section");
 if(sectionId)await authorizeClass(context as Actor,sectionId);
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
/** Assignment flows are scoped to an authenticated student and active enrollments. */
export const getAssignments=createServerFn({method:"GET"}).handler(async()=>{
 const {context,studentId}=await studentActor();
 if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
 if(!process.env.DATABASE_URL)return {connected:false,assignments:[]};
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 // The class directory already requires BOTH live same-year Program and
 // Section enrollments. Withdrawn learners must not see submitted feedback.
 const ids=[...new Set((await accessibleClasses(context as Actor)).map(row=>row.id))];
 if(!ids.length)return {connected:true,assignments:[]};
 const rows=await db.select({
  assessmentId:s.assessments.id,sectionId:s.assessments.sectionId,
  title:s.assessments.title,instructions:s.assessments.instructions,
  availableAt:s.assessments.availableAt,closesAt:s.assessments.closesAt,
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
 return {connected:true,assignments:[...newest.values()].map(row=>{
  const history=rows.filter(item=>item.assessmentId===row.assessmentId);
  // When a revision draft becomes attempt N+1, the grade/feedback on
  // returned attempt N must stay available while the student rewrites.
  // Never copy the old score into a new ungraded attempt.
  const returned=(row.status==="assigned"||row.status==="submitted")
   ?history.filter(item=>item.status==="returned" &&
     (item.attemptNumber??0)<(row.attemptNumber??0))
      .sort((a,b)=>(b.attemptNumber??0)-(a.attemptNumber??0))[0]
   :undefined;
  const workAvailability=assessmentAvailability({status:row.assessmentStatus,availableAt:row.availableAt,closesAt:row.closesAt});
  const maxAttempts=assessmentAttemptLimit(row.metadata);
  const nextAttempt=(row.attemptNumber??1)+(row.status==="returned"?1:0);
  const canEdit=workAvailability.actionable&&
   (row.status===null||row.status==="assigned"||row.status==="returned")&&
   (maxAttempts===null||nextAttempt<=maxAttempts);
  return {...row,
  workAvailability,canEdit,
  availableAt:row.availableAt?.toISOString()??null,closesAt:row.closesAt?.toISOString()??null,
  revisionFeedbackText:typeof returned?.feedback?.comment==="string"?returned.feedback.comment:"",
  revisionFeedbackSubmissionId:returned?.submissionId??null,
  attempts:history.map(item=>({attempt:item.attemptNumber??1,status:item.status??"assigned",score:item.score,submittedAt:item.submittedAt?.toISOString()??null,feedback:typeof item.feedback?.comment==="string"?item.feedback.comment:""})),
  dueAt:row.dueAt?.toISOString()??null,submittedAt:row.submittedAt?.toISOString()??null,
  gradedAt:row.gradedAt?.toISOString()??null,
  metadata:{rubric:typeof row.metadata.rubric==="string"?row.metadata.rubric:"",
    maxAttempts,
    criteria:readRubric(row.metadata.rubricCriteria),synthetic:row.metadata.synthetic===true,
    assignmentKind:typeof row.metadata.assignmentKind==="string"?row.metadata.assignmentKind:"classwork",
    curriculumLessonId:typeof row.metadata.curriculumLessonId==="string"?row.metadata.curriculumLessonId:null,
    curriculumLessonTitle:typeof row.metadata.curriculumLessonTitle==="string"?row.metadata.curriculumLessonTitle:null},
  rubricResult:row.feedback?.rubricResult??null,
  responseText:typeof row.response?.text==="string"?row.response.text:"",
  feedbackText:typeof row.feedback?.comment==="string"?row.feedback.comment:"",
  response:undefined,feedback:undefined,
 };})};
});

export const saveAssignmentResponse=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1),text:z.string()}).parse(value))
 .handler(async({data})=>{
  const {context,studentId,studentPersonId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const text=data.text.trim();
  if(text.length>20000)throw new Error("Response must be at most 20,000 characters");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId,status:s.assessments.status,availableAt:s.assessments.availableAt,closesAt:s.assessments.closesAt,dueAt:s.assessments.dueAt,metadata:s.assessments.metadata})
   .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),eq(s.assessments.status,"published"),inArray(s.sections.siteId,context.scope.siteIds!),inArray(s.sections.programId,context.scope.programIds??[]))).limit(1);
   if(!assessment)throw new Error("Published assessment not available in an authorized section");
   // Serialize this student/assessment across draft and final submission requests, 
   // including when no submission row exists to lock yet.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${assessment.id}))`);
   // Only the same current student + Program + Section + year can submit.
   // Check under the write transaction rather than trusting page state.
   const authorized=await authorizeClass(context as Actor,assessment.sectionId,undefined,tx);
   if(authorized.studentProfileId!==studentId)throw new AuthorizationError("student assignment identity");
   assertAssessmentActionable(assessment);
   const priorRows=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   const prior=priorRows[0];
   // Network retries must return the original receipt, not create another
   // attempt or repeat audit/domain events. A changed response stays locked.
   if(prior?.status==="submitted"&&prior.response?.text===text)
    return {submissionId:prior.id};
   if(prior&&prior.status!=="assigned"&&prior.status!=="returned")throw new Error("Submission is no longer editable");
   assertAssessmentAttemptAllowed(assessment.metadata,prior?.status==="returned"
    ?prior.attemptNumber+1:prior?.attemptNumber??1);
   if(text.length<3){
    // A worksheet/photo can be the answer. Only verified files already linked
    // to this student's current draft count; a returned attempt's old files do not.
    const fileIds=prior?.status==="assigned"&&Array.isArray(prior.response?.attachments)
     ?prior.response.attachments.filter((id):id is string=>typeof id==="string"&&z.string().uuid().safeParse(id).success):[];
    const files=fileIds.length?await tx.select({storageKey:s.documents.storageKey}).from(s.documents)
     .where(and(inArray(s.documents.id,fileIds),verifiedPrivateDocumentPredicate({
      subjectType:"assessment",subjectId:assessment.id,category:"assignment_submission",uploadedByPersonId:studentPersonId,
     }))).limit(fileIds.length):[];
    if(!files.some(file=>file.storageKey.startsWith(`learning/assignment/${assessment.id}/`)))
     throw new Error("Write a response of at least 3 characters or attach a verified PDF or image before submitting");
   }
   const now=new Date(),timeliness=assessment.dueAt&&now>assessment.dueAt?"late":"on_time";
   const emitSubmission=async(submissionId:string)=>{
    await emitEvent(tx, {eventType:EventTypes.SubmissionReceived,aggregateType:"submission",
     aggregateId:submissionId,actorPersonId:studentPersonId,payload:{
      assessmentId:assessment.id,studentProfileId:studentId,sectionId:assessment.sectionId,timeliness}});
   };
   const resolveFollowUps=async(submissionId:string)=>{
    const rows=await tx.select({id:s.actions.id,status:s.actions.status,metadata:s.actions.metadata}).from(s.actions)
     .where(and(eq(s.actions.type,"missing_work_follow_up"),eq(s.actions.subjectType,"student_profile"),eq(s.actions.subjectId,studentId),inArray(s.actions.siteId,context.scope.siteIds!),inArray(s.actions.programId,context.scope.programIds??[])));
    for(const action of rows){
     if(action.metadata.assessmentId!==assessment.id||action.status==="resolved"||action.status==="cancelled")continue;
     await tx.update(s.actions).set({status:"resolved",resolvedAt:now,resolutionNote:"Student submitted overdue assignment.",updatedAt:now}).where(eq(s.actions.id,action.id));
     await emitEvent(tx, {eventType:EventTypes.ActionResolved,aggregateType:"action",
      aggregateId:action.id,actorPersonId:studentPersonId,payload:{submissionId,assessmentId:assessment.id}});
     await writeAudit(tx, {actorPersonId:studentPersonId,action:"missing_work.resolved_by_submission",resourceType:"action",resourceId:action.id,before:{status:action.status},after:{status:"resolved",submissionId},context:{accountId:context.accountId,sessionId:context.sessionId,assessmentId:assessment.id}});
    }
   };

   if(prior?.status==="returned"){
    const [revision]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,attemptNumber:prior.attemptNumber+1,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
    if(!revision)throw new Error("Unable to save revision");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.submit_revision",resourceType:"submission",resourceId:revision.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId}});
    await emitSubmission(revision.id);
    await resolveFollowUps(revision.id);
    return {submissionId:revision.id};
   }
   if(prior){
    const [submitted]=await tx.update(s.submissions) .set({status:"submitted",response:writtenSubmissionResponse(prior.response,text),timeliness,submittedAt:now,updatedAt:now}).where(and(eq(s.submissions.id,prior.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!submitted)throw new Error("Assignment was submitted or changed in another tab");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.submit",resourceType:"submission",resourceId:submitted.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId}});
    await emitSubmission(submitted.id);
    await resolveFollowUps(submitted.id);
    return {submissionId:submitted.id};
   }
   const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,status:"submitted",timeliness,response:{text},submittedAt:now}).returning({id:s.submissions.id});
   if(!created)throw new Error("Unable to submit");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.submit",resourceType:"submission",resourceId:created.id,after:{status:"submitted"},context:{accountId:context.accountId,sessionId:context.sessionId}});
    await emitSubmission(created.id);
    await resolveFollowUps(created.id);
   return {submissionId:created.id};
  });
 });

/** Compatibility endpoint: all scoring goes through the canonical gradebook service. */
export const gradeSyntheticAssignment=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
  submissionId:z.string().uuid(),score:z.number().finite().min(0).max(100),
  comment:z.string().max(4000)
 }).parse(input))
 .handler(async({data})=>{
  // Legacy clients send a percentage; the canonical service takes points.
  // Verify the teaching relationship before looking up assessment details.
  await teacherForSubmission(data.submissionId);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [item]=await db.select({points:s.assessments.pointsPossible})
   .from(s.submissions)
   .innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .where(eq(s.submissions.id,data.submissionId)).limit(1);
  const points=Number(item?.points);
  if(!Number.isFinite(points)||points<=0)throw new Error("Assessment points unavailable");
  return gradeSubmission({data:{
   submissionId:data.submissionId,
   score:Math.round(points*data.score)/100,
   feedbackComment:data.comment
  }});
 });

/** Legacy name delegates to the single audited return-for-revision command. */
export const returnSyntheticAssignment=returnSubmissionForRevision;

/** Compatibility adapter; teacher authoring uses the canonical gradebook command. */
export const createSyntheticAssignment=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
  sectionId:z.string().uuid(),title:z.string().trim().min(3).max(200),
  instructions:z.string().max(20000),dueAt:z.string(),
  pointsPossible:z.number().finite().min(1).max(1000),
  rubric:z.string().max(10000)
 }).parse(input))
 .handler(async({data})=>{
  const dueAt=new Date(data.dueAt);
  if(!Number.isFinite(dueAt.getTime()))throw new Error("Invalid due date");
  return createAssessment({data:{
   sectionId:data.sectionId,title:data.title,instructions:data.instructions,
   rubric:data.rubric,pointsPossible:data.pointsPossible,dueAt:dueAt.toISOString(),publishNow:true
  }});
 });

export const getSyntheticAssignmentHistory=createServerFn({method:"GET"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1)}).parse(value))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const {context,studentId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [assessment]=await db.select({sectionId:s.assessments.sectionId})
   .from(s.assessments)
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.assessments.id,data.assessmentId),
     inArray(s.assessments.status,["published","closed"]),
     inArray(s.sections.siteId,context.scope.siteIds!),
     inArray(s.sections.programId,context.scope.programIds??[]))).limit(1);
  if(!assessment)throw new AuthorizationError("class assignment history");
  await authorizeClass(context as Actor,assessment.sectionId);
  const rows=await db.select({attempt:s.submissions.attemptNumber,status:s.submissions.status,
   submittedAt:s.submissions.submittedAt,score:s.submissions.score,
   response:s.submissions.response,feedback:s.submissions.feedback})
   .from(s.submissions).innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
   .where(and(eq(s.submissions.assessmentId,data.assessmentId),eq(s.submissions.studentProfileId,studentId),inArray(s.sections.siteId,context.scope.siteIds!),inArray(s.sections.programId,context.scope.programIds??[])))
   .orderBy(desc(s.submissions.attemptNumber));
  return rows.map(row=>({attempt:row.attempt,status:row.status,
   submittedAt:row.submittedAt?.toISOString()??null,score:row.score,
   text:typeof row.response?.text==="string"?row.response.text:"",
   feedback:typeof row.feedback?.comment==="string"?row.feedback.comment:""}));
 });

/** Drafts remain in the existing response JSON on an assigned attempt. */
export const saveAssignmentDraft=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({assessmentId:z.string().min(1),text:z.string()}).parse(value))
 .handler(async({data})=>{
  const {context,studentId}=await studentActor();
  if(!context.scope.siteIds?.length)throw new AuthorizationError("site membership");
  if(data.text.length>20000)throw new Error("Draft too long");
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [assessment]=await tx.select({id:s.assessments.id,sectionId:s.assessments.sectionId,status:s.assessments.status,availableAt:s.assessments.availableAt,closesAt:s.assessments.closesAt,metadata:s.assessments.metadata})
    .from(s.assessments).innerJoin(s.sections,eq(s.sections.id,s.assessments.sectionId))
    .where(and(eq(s.assessments.id,data.assessmentId),inArray(s.sections.siteId,context.scope.siteIds!),inArray(s.sections.programId,context.scope.programIds??[]),eq(s.assessments.status,"published"))).limit(1);
   if(!assessment)throw new Error("Published assessment not available in an authorized section");
   // Serialize this student/assessment across draft and final submission requests, 
   // including when no submission row exists to lock yet.
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${studentId}), hashtext(${assessment.id}))`);
   const authorized=await authorizeClass(context as Actor,assessment.sectionId,undefined,tx);
   if(authorized.studentProfileId!==studentId)throw new AuthorizationError("student assignment identity");
   assertAssessmentActionable(assessment);
   const [latest]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId))).orderBy(desc(s.submissions.attemptNumber)).limit(1).for("update");
   // The submit coordinator may retry after losing its final response.
   // Treat only identical already-submitted text as a harmless saved draft.
   if(latest?.status==="submitted"&&latest.response?.text===data.text.trim())
    return {saved:true};
   if(latest && !["assigned","returned"].includes(latest.status))throw new Error("Submitted work cannot be overwritten");
   assertAssessmentAttemptAllowed(assessment.metadata,latest?.status==="returned"
    ?latest.attemptNumber+1:latest?.attemptNumber??1);
   if(latest?.status==="returned"){
    const [draft]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,attemptNumber:latest.attemptNumber+1,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing().returning({id:s.submissions.id});
    if(draft){await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.draft_revision",resourceType:"submission",resourceId:draft.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId}});return {saved:true};}
    const [existing]=await tx.select().from(s.submissions).where(and(eq(s.submissions.assessmentId,assessment.id),eq(s.submissions.studentProfileId,studentId),eq(s.submissions.attemptNumber,latest.attemptNumber+1))).limit(1);
    if(!existing||existing.status!=="assigned")throw new Error("Revision already submitted");
    const [saved]=await tx.update(s.submissions) .set({response:writtenSubmissionResponse(existing.response,data.text,true),updatedAt:new Date()}).where(and(eq(s.submissions.id,existing.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:saved.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId}});
    return {saved:true};
   }
   if(latest){
    const [saved]=await tx.update(s.submissions) .set({response:writtenSubmissionResponse(latest.response,data.text,true),updatedAt:new Date()}).where(and(eq(s.submissions.id,latest.id),eq(s.submissions.status,"assigned"))).returning({id:s.submissions.id});
    if(!saved)throw new Error("Draft already submitted");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:saved.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId}});
   }else{
    const [created]=await tx.insert(s.submissions).values({assessmentId:assessment.id,studentProfileId:studentId,status:"assigned",response:{text:data.text,draft:true}}).onConflictDoNothing().returning({id:s.submissions.id});
    if(!created)throw new Error("Assignment draft changed in another tab; refresh before saving");
    await writeAudit(tx, {actorPersonId:context.actorPersonId,action:"assignment.draft_save",resourceType:"submission",resourceId:created.id,after:{status:"assigned"},context:{accountId:context.accountId,sessionId:context.sessionId}});
   }
   return {saved:true};
  });
 });

/** Legacy assessment management delegates to canonical status and calendar events. */
export const manageSyntheticAssignment=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
  assessmentId:z.string().uuid(),
  action:z.enum(["close","reopen","reschedule"]),
  dueAt:z.string().optional()
 }).parse(input))
 .handler(async({data})=>{
  const dueAt=data.dueAt?new Date(data.dueAt):undefined;
  if(dueAt&&!Number.isFinite(dueAt.getTime()))throw new Error("Invalid due date");
  return manageAssessment({data:{
   assessmentId:data.assessmentId,action:data.action,
   ...(dueAt?{dueAt:dueAt.toISOString()}:{})
  }});
 });

/** Compatibility rubric grading; the canonical gradebook owns the write and audit. */
export const gradeSyntheticRubric=createServerFn({method:"POST"})
 .validator((input:unknown)=>z.object({
  submissionId:z.string().uuid(),
  grades:z.array(z.object({id:z.string().min(1),points:z.number().finite().min(0),
   comment:z.string().max(1000).optional()})).max(20),
  comment:z.string().max(4000)
 }).parse(input))
 .handler(async({data})=>{
  await teacherForSubmission(data.submissionId);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [record]=await db.select({
   metadata:s.assessments.metadata,points:s.assessments.pointsPossible
  }).from(s.submissions)
   .innerJoin(s.assessments,eq(s.assessments.id,s.submissions.assessmentId))
   .where(eq(s.submissions.id,data.submissionId)).limit(1);
  if(!record)throw new AuthorizationError("assigned submission");
  const criteria=readRubric(record.metadata.rubricCriteria);
  const result=scoreRubric(criteria,data.grades);
  if(result.possible!==Number(record.points))
   throw new Error("Rubric points do not match the assessment");
  const rubricNotes=data.grades.filter(grade=>grade.comment?.trim())
   .map(grade=>grade.id+": "+grade.comment!.trim()).join("\n");
  const feedbackComment=[data.comment.trim(),rubricNotes].filter(Boolean).join("\n").slice(0,4000);
  await gradeSubmission({data:{
   submissionId:data.submissionId,
   rubricScores:data.grades.map(({id,points})=>({id,points})),
   feedbackComment
  }});
  return {submissionId:data.submissionId,...result};
 });

/** Compatibility for existing student assignment screen imports. */
export const saveSyntheticAssignmentDraft=saveAssignmentDraft;
