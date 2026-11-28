import {readHistoricalClassWork} from "./historical-class-work.server";
import { projectSubmissionRevisionPage } from "@/domain/submission-revisions";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { actions } from "@/db/schema";
import { canonicalClassEnrollments } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { nativeClassWorkRows,nativeOverdueWorkPredicate } from "./native-class-work-query.server";
import { assertNativeClassTeacher } from "./native-class-teacher-authority.server";
import { existingMissingWorkFollowUpResponse } from "@/domain/missing-work-follow-up-ownership";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,notify,writeAudit } from "@/platform/mutation";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const input=z.object({classId:z.string().uuid()}).strict();
const pageInput=input.extend({offset:z.number().int().min(0).max(1000000).default(0)}).strict();
const asRecord=(value:unknown):Record<string,unknown>=>
  value && typeof value==="object" && !Array.isArray(value)
    ?value as Record<string,unknown>:{};
type HomeworkRow={
  id:string;status:string;submitted_at:Date|null;
  assignment_key:string;assignment_title:string;response:unknown;
  first_name:string|null;last_name:string|null;preferred_name:string|null;
};

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One reader for both teacher queues: exact CAN teacher, current appointment,
 * current Class publication and matched Site/Organization. */
async function authorizedTeacher(tx:Tx,classId:string){
  const actor=await getCanonicalCommandContext(getRequest());
  const cls=await assertNativeClassTeacher(tx,actor,classId);
  return { cls, actor };
}

/** Independent academic teacher queue, using only the current native Class
 * and Course Attempt. This read does not turn a teacher appointment into an
 * independent grader authorization, and cannot alter grades or submissions.
 */
export const getNativeClassTeacherHomework=createServerFn({method:"GET"})
 .validator((value:unknown)=>pageInput.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   return db.transaction(async tx=>{
     const {cls}=await authorizedTeacher(tx,data.classId);
     const result=await tx.execute(sql`
       SELECT gs.id,gs.status,gs.submitted_at,gs.response,
         ga.assignment_key,w.title AS assignment_title,
         p.legal_first_name AS first_name,
         p.legal_last_name AS last_name,
         p.preferred_name
       FROM (${nativeClassWorkRows([cls.id])}) w
       INNER JOIN public.graded_submissions gs ON gs.id=w.submission_id
       INNER JOIN public.people p ON p.id=w.learner_person_id
       INNER JOIN public.graded_assignments ga
         ON ga.id=gs.assignment_id
        AND ga.course_version_id=gs.course_version_id
        AND ga.section_id IS NULL
       WHERE gs.status IN ('submitted','returned','graded')
       ORDER BY gs.submitted_at DESC NULLS LAST,gs.id
       LIMIT 101 OFFSET ${data.offset}
     `);
     const rows=(result.rows as HomeworkRow[]).slice(0,100);
     return {
       items:rows.map(row=>{
         const response=asRecord(row.response);
         return {
           id:row.id,
           studentName:row.preferred_name??([row.first_name,row.last_name].filter(Boolean).join(" ")||"Learner"),
           assignmentTitle:row.assignment_title??row.assignment_key,
           status:row.status,
           responseText:typeof response.text==="string"?response.text:"",
           teacherFeedback:response.practiceResponse===true&&typeof response.teacherFeedback==="string"
              ?response.teacherFeedback:null,
           isPracticeSubmission:response.practiceResponse===true,
           practiceScore:response.practiceResponse===true
             ?(typeof response.practiceScore==="number"?response.practiceScore:
               typeof response.demoScore==="number"?response.demoScore:null):null,
           practiceScoreMax:response.practiceResponse===true
             ?(typeof response.practiceScoreMax==="number"?response.practiceScoreMax:
               typeof response.maxDemoScore==="number"?response.maxDemoScore:null):null,
           submittedAt:row.submitted_at?new Date(row.submitted_at).toISOString():null,
         };
       }),
       partial:result.rows.length>100,
       nextOffset:result.rows.length>100?data.offset+100:null,
       canRecordOfficialGrade:false,
       canReturnPracticeFeedback:true,
       notice:"Viewing submitted work does not confer independent grading authority. Official grading requires a verified independent grader appointment and governed Course policy.",
     };
   });
 });



/** Exact Class overdue-work roster, using the same population and deadline
 * predicate as Teacher Today. This is a read, not an intervention or grade. */
export const getNativeClassTeacherMissingWork=createServerFn({method:"GET"})
 .validator((value:unknown)=>pageInput.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   return db.transaction(async tx=>{
     const {cls,actor}=await authorizedTeacher(tx,data.classId);
     const result=await tx.execute(sql`
       WITH work AS (
         ${nativeClassWorkRows([cls.id])}
       )
       SELECT w.enrollment_id,w.assignment_id,w.title,w.due_at,
         coalesce(w.submission_status,'not_started') AS status,
         p.preferred_name,p.legal_first_name,p.legal_last_name,
         follow_up.id AS follow_up_id,follow_up.owner_person_id AS follow_up_owner
       FROM work w
       JOIN public.people p ON p.id=w.learner_person_id
       LEFT JOIN LATERAL (
         SELECT a.id,a.owner_person_id FROM public.actions a
         WHERE a.subject_type='class_enrollment' AND a.subject_id=w.enrollment_id
           AND a.type='missing_work_follow_up' AND a.status IN ('open','in_progress','waiting')
           AND a.organization_id=${cls.operatingOrganizationId}::uuid AND a.site_id=${cls.siteId}::uuid
           AND a.program_id IS NULL AND a.section_id IS NULL
           AND a.metadata->>'classId'=${cls.id} AND a.metadata->>'assignmentId'=w.assignment_id::text
           AND a.metadata->>'source'='native_class_missing_work'
         ORDER BY a.created_at,a.id LIMIT 1
       ) follow_up ON true
       WHERE ${nativeOverdueWorkPredicate}
       ORDER BY w.due_at,w.enrollment_id,w.assignment_id
       LIMIT 101 OFFSET ${data.offset}
     `);
     const rows=result.rows as Array<{
       enrollment_id:string;assignment_id:string;title:string;due_at:Date|string;
       status:string;preferred_name:string|null;legal_first_name:string|null;legal_last_name:string|null;
       follow_up_id:string|null;follow_up_owner:string|null;
     }>;
     return {items:rows.slice(0,100).map(row=>({
       classEnrollmentId:row.enrollment_id,assignmentId:row.assignment_id,
       assignmentTitle:row.title,dueAt:new Date(row.due_at).toISOString(),status:row.status,
       followUpActionId:row.follow_up_owner===actor.actorPersonId?row.follow_up_id:null,
       assignedToAnotherTeacher:!!row.follow_up_id&&row.follow_up_owner!==actor.actorPersonId,
       studentName:row.preferred_name??([row.legal_first_name,row.legal_last_name].filter(Boolean).join(" ")||"Learner"),
     })),nextOffset:rows.length>100?data.offset+100:null};
   });
 });

/** Open one canonical Action per enrollment/assignment while the work is overdue.
 * Lock enrollment before rechecking work, matching the learner submission lock.
 * Audit, event and private in-app notice are committed with the Action. */
export const createNativeClassMissingWorkFollowUp=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.extend({
   classEnrollmentId:z.string().uuid(),assignmentId:z.string().uuid(),
 }).strict().parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const {cls,actor}=await authorizedTeacher(tx,data.classId);
     assertCapability(actor,"action.create");
     const [enrollment]=await tx.select().from(canonicalClassEnrollments)
       .where(and(eq(canonicalClassEnrollments.id,data.classEnrollmentId),
         eq(canonicalClassEnrollments.classId,cls.id),eq(canonicalClassEnrollments.status,"active")))
       .for("update").limit(1);
     if(!enrollment)throw new AuthorizationError("current exact Class Enrollment");
     const key="native-missing-work:"+enrollment.id+":"+data.assignmentId;
     await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
     const result=await tx.execute(sql`
       SELECT title,submission_status FROM (${nativeClassWorkRows([cls.id])}) work
       WHERE enrollment_id=${enrollment.id}::uuid AND assignment_id=${data.assignmentId}::uuid
         AND ${nativeOverdueWorkPredicate}
       LIMIT 1
     `);
     const work=result.rows[0] as {title:string;submission_status:string|null}|undefined;
     if(!work)throw new AuthorizationError("current overdue Class assignment");
     const [existing]=await tx.select({id:actions.id,ownerPersonId:actions.ownerPersonId})
       .from(actions).where(and(eq(actions.type,"missing_work_follow_up"),
         eq(actions.subjectType,"class_enrollment"),eq(actions.subjectId,enrollment.id),
         eq(actions.organizationId,cls.operatingOrganizationId),eq(actions.siteId,cls.siteId!),
         inArray(actions.status,["open","in_progress","waiting"]),
         sql`${actions.programId} IS NULL AND ${actions.sectionId} IS NULL`,
         sql`${actions.metadata}->>'source'='native_class_missing_work'`,
         sql`${actions.metadata}->>'classId'=${cls.id} AND ${actions.metadata}->>'assignmentId'=${data.assignmentId}`))
       .limit(1);
     if(existing)return existingMissingWorkFollowUpResponse(existing,actor.actorPersonId!);
     const [action]=await tx.insert(actions).values({
       type:"missing_work_follow_up",status:"open",priority:"normal",
       title:"Missing Class work follow-up",description:"Review the assigned Class work and record the outcome.",
       organizationId:cls.operatingOrganizationId,siteId:cls.siteId,
       ownerPersonId:actor.actorPersonId!,subjectType:"class_enrollment",subjectId:enrollment.id,
       dueAt:new Date(),metadata:{source:"native_class_missing_work",classId:cls.id,assignmentId:data.assignmentId},
     }).returning({id:actions.id});
     if(!action)throw new Error("Unable to create follow-up");
     await notify(tx,{recipientPersonId:enrollment.learnerPersonId,type:"missing_work_follow_up",
       title:"Teacher follow-up on Class work",
       body:"Your teacher flagged overdue work. Open your Class assignments to review the work and any feedback.",
       resourceType:"action",resourceId:action.id});
     await emitEvent(tx,{eventType:EventTypes.ActionCreated,aggregateType:"action",aggregateId:action.id,
       actorPersonId:actor.actorPersonId!,organizationId:cls.operatingOrganizationId,siteId:cls.siteId,
       payload:{subjectType:"class_enrollment",subjectId:enrollment.id,classId:cls.id,assignmentId:data.assignmentId}});
     await writeAudit(tx,actor,{action:"missing_work.follow_up",entityType:"action",entityId:action.id,
       scope:{organizationId:cls.operatingOrganizationId,siteId:cls.siteId},
       after:{classId:cls.id,classEnrollmentId:enrollment.id,assignmentId:data.assignmentId}});
     return {actionId:action.id,created:true,assignedToAnotherTeacher:false};
   });
 });

/** Exact active Class appointment, active learner enrollment and native attempt.
 * No history is disclosed on the basis of a submission UUID alone. */
export const getNativeClassTeacherHomeworkHistory=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.extend({
   submissionId:z.string().uuid(),beforeRevision:z.number().int().positive().optional(),
 }).strict().parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   return db.transaction(async tx=>{
     const {cls}=await authorizedTeacher(tx,data.classId);
     const result=await tx.execute(sql`
       SELECT r.revision_no,r.status,r.response,r.submitted_at,r.recorded_at,r.source
       FROM public.graded_submission_revisions r
       JOIN public.graded_submissions gs ON gs.id=r.submission_id AND gs.course_version_id=r.course_version_id
       JOIN public.learner_course_attempts ca ON ca.id=gs.course_attempt_id AND ca.course_version_id=gs.course_version_id
       JOIN public.class_enrollments ce ON ce.id=ca.class_enrollment_id AND ce.course_attempt_id=ca.id
       JOIN public.graded_assignments ga ON ga.id=gs.assignment_id AND ga.course_version_id=gs.course_version_id
       JOIN public.official_course_assignment_versions o ON o.id=ga.official_assignment_version_id AND o.course_version_id=ga.course_version_id
       WHERE gs.id=${data.submissionId}::uuid AND ce.class_id=${cls.id}::uuid
         AND ce.status='active' AND ca.status='active' AND ca.section_id IS NULL
         AND ca.course_version_id=${cls.courseVersionId}::uuid AND ga.section_id IS NULL
         AND ca.deployment_id=${cls.deploymentId}::uuid AND ca.adoption_id=${cls.adoptionId}::uuid
         AND ca.offering_version_id=${cls.offeringVersionId}::uuid
         AND gs.status IN ('submitted','returned','graded')
         AND (${data.beforeRevision??null}::int IS NULL OR r.revision_no<${data.beforeRevision??null}::int)
       ORDER BY r.revision_no DESC LIMIT 21
     `);
     return projectSubmissionRevisionPage(result.rows);
   });
 });

const practiceFeedbackInput=input.extend({
  submissionId:z.string().uuid(),
  feedback:z.string().trim().min(3).max(3000),
  practiceScore:z.number().int().min(0).max(10).nullable(),
}).strict();

/**
 * Assigned Class teachers may return private practice feedback in any Site.
 * This updates existing Class-linked homework only. Never grants authority
 * to write official grading_decisions, gradebook or credential records.
 */
export const returnNativeClassPracticeFeedback=createServerFn({method:"POST"})
 .validator((value:unknown)=>practiceFeedbackInput.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const {cls,actor}=await authorizedTeacher(tx,data.classId);

     const rows=await tx.execute(sql`
       SELECT gs.id,gs.status,gs.response
       FROM public.graded_submissions gs
       JOIN public.learner_course_attempts ca ON ca.id=gs.course_attempt_id
        AND ca.course_version_id=gs.course_version_id
       JOIN public.class_enrollments ce ON ce.id=ca.class_enrollment_id
        AND ce.course_attempt_id=ca.id AND ce.status='active'
       JOIN public.graded_assignments ga ON ga.id=gs.assignment_id
        AND ga.course_version_id=ca.course_version_id AND ga.section_id IS NULL
       JOIN public.official_course_assignment_versions o ON o.id=ga.official_assignment_version_id AND o.course_version_id=ga.course_version_id
       WHERE gs.id=${data.submissionId}::uuid
         AND ce.class_id=${cls.id}::uuid
         AND ca.status='active' AND ca.section_id IS NULL
         AND ca.course_version_id=${cls.courseVersionId}::uuid
         AND ca.deployment_id=${cls.deploymentId}::uuid AND ca.adoption_id=${cls.adoptionId}::uuid
         AND ca.offering_version_id=${cls.offeringVersionId}::uuid
         AND gs.status IN ('submitted','returned')
         AND gs.response @> '{"practiceResponse":true}'::jsonb
       FOR UPDATE OF gs
     `);
     const row=rows.rows[0] as {id:string;status:string;response:unknown}|undefined;
     if(!row)throw new AuthorizationError("current Class practice submission");
     const original=asRecord(row.response);
     if(row.status==="returned"&&original.teacherFeedback===data.feedback&&original.practiceScore===data.practiceScore)
       return {submissionId:row.id,status:"returned" as const,practiceOnly:true as const};
     const updated=await tx.execute(sql`
       UPDATE public.graded_submissions
       SET response=response || jsonb_build_object(
         'teacherFeedback',${data.feedback}::text,
         'practiceScore',${data.practiceScore}::int,
         'practiceScoreMax',10,
         'practiceResponse',true
       ),status='returned'
       WHERE id=${row.id}::uuid AND status IN ('submitted','returned')
       RETURNING id
     `);
     if(updated.rows.length!==1)throw new AuthorizationError("submission changed");
     await writeCanonicalAudit(tx,{
       actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
       eventCode:"class.homework.practice_feedback.recorded",
       entityKind:"graded_submission",entityId:row.id,
       payload:{
         classId:cls.id,practiceOnly:true,previousStatus:row.status,
         hadPriorFeedback:typeof original.teacherFeedback==="string",
         scoreRecorded:data.practiceScore!==null,
       },
     });
     return {submissionId:row.id,status:"returned" as const,practiceOnly:true as const};
   });
 });


/** Review readiness only. Draft questions, hidden keys, personal learner
 * attempts and official grading appointments are not exposed here. */
export const getNativeClassTeacherAssessments=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const {cls}=await authorizedTeacher(tx,data.classId);
     const result=await tx.execute(sql`
       SELECT av.assessment_key, av.lifecycle AS version_lifecycle,
              fv.lifecycle AS form_lifecycle, aa.status AS administration_status
       FROM public.assessment_administrations aa
       JOIN public.assessment_versions av ON av.id=aa.assessment_version_id
       JOIN public.assessment_form_versions fv
         ON fv.id=aa.form_version_id AND fv.assessment_version_id=av.id
       WHERE aa.course_version_id=${cls.courseVersionId}::uuid
         AND aa.deployment_id=${cls.deploymentId}::uuid
         AND aa.administering_organization_id=${cls.operatingOrganizationId}::uuid
       ORDER BY av.assessment_key
       LIMIT 51
     `);
     const rows=result.rows as Array<{
       assessment_key:string;version_lifecycle:string;
       form_lifecycle:string;administration_status:string;
     }>;
     return {items:rows.slice(0,50).map(item=>({
       key:item.assessment_key,
       assessmentStatus:item.version_lifecycle,
       formStatus:item.form_lifecycle,
       administrationStatus:item.administration_status,
       ready:item.version_lifecycle==="published" &&
         item.form_lifecycle==="published" &&
         item.administration_status==="open",
     })),partial:rows.length>50};
   });
 });

/** Teachers may inspect submitted school work for current learners in their exact Class. */
export const getNativeClassTeacherHistoricalWork=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.extend({beforeId:z.string().uuid().optional()}).strict().parse(raw))
 .handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
  return db.transaction(async tx=>{
   const {cls}=await authorizedTeacher(tx,data.classId);
   return readHistoricalClassWork(tx,{classId:cls.id,classEnrollmentId:null,beforeId:data.beforeId});
  });
 });
