import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const input=z.object({classId:z.string().uuid()}).strict();
const asRecord=(value:unknown):Record<string,unknown>=>
  value && typeof value==="object" && !Array.isArray(value)
    ?value as Record<string,unknown>:{};
type HomeworkRow={
  id:string;status:string;submitted_at:Date|null;
  assignment_key:string;assignment_spec:unknown;response:unknown;
  first_name:string|null;last_name:string|null;preferred_name:string|null;
};

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** One reader for both teacher queues: exact CAN teacher, current appointment,
 * current Class publication and matched Site/Organization. */
async function authorizedTeacher(tx:Tx,classId:string){
  const actor=await getCanonicalCommandContext(getRequest());
  if(actor.role!=="teacher"||!actor.actorPersonId||
      actor.scope.siteIds?.length!==1||
      actor.scope.organizationIds?.length!==1)
     throw new AuthorizationError("exact CAN academic teacher membership");
  assertCapability(actor,"teacher:read");
  const [cls]=await tx.select().from(canonicalClasses)
       .where(eq(canonicalClasses.id,classId)).limit(1);
     const now=new Date();
     if(!cls||cls.state!=="active"||
        cls.siteId!==actor.scope.siteIds[0]||
        cls.operatingOrganizationId!==actor.scope.organizationIds[0])
       throw new AuthorizationError("own active teaching Site and Class");
     const [assignment]=await tx.select({id:canonicalClassStaffAssignments.id})
       .from(canonicalClassStaffAssignments).where(and(
         eq(canonicalClassStaffAssignments.classId,cls.id),
         eq(canonicalClassStaffAssignments.personId,actor.actorPersonId),
         eq(canonicalClassStaffAssignments.roleCode,"teacher"),
         eq(canonicalClassStaffAssignments.state,"approved"),
         lte(canonicalClassStaffAssignments.beginsAt,now),
         or(isNull(canonicalClassStaffAssignments.endsAt),
            gt(canonicalClassStaffAssignments.endsAt,now)),
       )).limit(1);
     if(!assignment)throw new AuthorizationError("current specific Class teacher appointment");
  await currentClassAuthority(tx,cls.id,now);
  return { cls, actor };
}

/** Independent academic teacher queue, using only the current native Class
 * and Course Attempt. This read does not turn a teacher appointment into an
 * independent grader authorization, and cannot alter grades or submissions.
 */
export const getNativeClassTeacherHomework=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   return db.transaction(async tx=>{
     const {cls}=await authorizedTeacher(tx,data.classId);
     const result=await tx.execute(sql`
       SELECT gs.id,gs.status,gs.submitted_at,gs.response,
         ga.assignment_key,ga.assignment_spec,
         p.legal_first_name AS first_name,
         p.legal_last_name AS last_name,
         p.preferred_name
       FROM public.graded_submissions gs
       INNER JOIN public.learner_course_attempts ca
         ON ca.id=gs.course_attempt_id
        AND ca.course_version_id=gs.course_version_id
       INNER JOIN public.class_enrollments ce
         ON ce.id=ca.class_enrollment_id
        AND ce.course_attempt_id=ca.id
        AND ce.status='active'
       INNER JOIN public.people p ON p.id=ce.learner_person_id
       INNER JOIN public.graded_assignments ga
         ON ga.id=gs.assignment_id
        AND ga.course_version_id=ca.course_version_id
        AND ga.section_id IS NULL
       WHERE ce.class_id=${cls.id}::uuid
         AND ca.status='active'
         AND ca.section_id IS NULL
         AND ca.course_version_id=${cls.courseVersionId}::uuid
         AND gs.status IN ('submitted','returned','graded')
       ORDER BY gs.submitted_at DESC NULLS LAST,gs.id
       LIMIT 101
     `);
     const rows=(result.rows as HomeworkRow[]).slice(0,100);
     return {
       items:rows.map(row=>{
         const spec=asRecord(row.assignment_spec);
         const response=asRecord(row.response);
         return {
           id:row.id,
           studentName:row.preferred_name??([row.first_name,row.last_name].filter(Boolean).join(" ")||"Learner"),
           assignmentTitle:String(spec.title??row.assignment_key),
           status:row.status,
           responseText:typeof response.text==="string"?response.text:"",
           demoFeedback:response.synthetic===true&&typeof response.teacherFeedback==="string"
              ?response.teacherFeedback:null,
           isSyntheticPractice:response.synthetic===true&&response.practiceResponse===true,
           practiceScore:response.synthetic===true&&typeof response.demoScore==="number"?response.demoScore:null,
           practiceScoreMax:response.synthetic===true&&typeof response.maxDemoScore==="number"?response.maxDemoScore:null,
           submittedAt:row.submitted_at?.toISOString()??null,
         };
       }),
       partial:result.rows.length>100,
       canRecordOfficialGrade:false,
       canReturnPracticeFeedback:cls.siteId==="f1000000-0000-4000-8000-000000000003",
       notice:"Viewing submitted work does not confer independent grading authority. Official grading requires a verified independent grader appointment and governed Course policy.",
     };
   });
 });



const practiceFeedbackInput=input.extend({
  submissionId:z.string().uuid(),
  feedback:z.string().trim().min(3).max(3000),
  practiceScore:z.number().int().min(0).max(10).nullable(),
}).strict();

/**
 * Let verified Valor teachers return practice feedback to synthetic students.
 * This updates existing Class-linked homework only. Never grants authority
 * to write official grading_decisions, gradebook or credential records.
 */
export const returnNativeClassPracticeFeedback=createServerFn({method:"POST"})
 .validator((value:unknown)=>practiceFeedbackInput.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const {cls,actor}=await authorizedTeacher(tx,data.classId);
     if(cls.siteId!=="f1000000-0000-4000-8000-000000000003")
       throw new AuthorizationError("synthetic Valor demonstration only");
     const rows=await tx.execute(sql`
       SELECT gs.id,gs.status,gs.response
       FROM public.graded_submissions gs
       JOIN public.learner_course_attempts ca ON ca.id=gs.course_attempt_id
        AND ca.course_version_id=gs.course_version_id
       JOIN public.class_enrollments ce ON ce.id=ca.class_enrollment_id
        AND ce.course_attempt_id=ca.id AND ce.status='active'
       JOIN public.graded_assignments ga ON ga.id=gs.assignment_id
        AND ga.course_version_id=ca.course_version_id AND ga.section_id IS NULL
       JOIN public.people p ON p.id=ce.learner_person_id
       JOIN public.sites site ON site.id=${cls.siteId}::uuid
       WHERE gs.id=${data.submissionId}::uuid
         AND ce.class_id=${cls.id}::uuid
         AND ca.status='active' AND ca.section_id IS NULL
         AND ca.course_version_id=${cls.courseVersionId}::uuid
         AND gs.status IN ('submitted','returned')
         AND gs.response @> '{"synthetic":true,"practiceResponse":true}'::jsonb
         AND p.metadata @> '{"synthetic":true}'::jsonb
         AND site.metadata @> '{"synthetic":true}'::jsonb
       FOR UPDATE OF gs
     `);
     const row=rows.rows[0] as {id:string;status:string;response:unknown}|undefined;
     if(!row)throw new AuthorizationError("current synthetic Class submission");
     const original=asRecord(row.response);
     const updated=await tx.execute(sql`
       UPDATE public.graded_submissions
       SET response=response || jsonb_build_object(
         'teacherFeedback',${data.feedback}::text,
         'demoScore',${data.practiceScore}::int,
         'maxDemoScore',10,
         'synthetic',true,'noncredit',true,'practiceResponse',true
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


/** Exact synthetic Class teacher preview of privately saved draft practice.
 * Answers remain formative: no scores, official grades, or assessment keys.
 * RLS and the current named Class teacher appointment are checked on each read.
 */
export const getNativeClassTeacherDraftPractice=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   return db.transaction(async tx=>{
     const {cls}=await authorizedTeacher(tx,data.classId);
     if(cls.siteId!=="f1000000-0000-4000-8000-000000000003")
       return {items:[],partial:false};
     const result=await tx.execute(sql`
       SELECT fp.id,fp.recorded_at AS "recordedAt",
         pr.response,COALESCE(p.preferred_name,
           concat_ws(' ',p.legal_first_name,p.legal_last_name)) AS "studentName"
       FROM public.formative_practice_attempts fp
       JOIN public.learner_course_attempts ca ON ca.id=fp.course_attempt_id
         AND ca.course_version_id=fp.course_version_id
       JOIN public.class_enrollments ce ON ce.id=ca.class_enrollment_id
         AND ce.course_attempt_id=ca.id AND ce.status='active'
       JOIN public.people p ON p.id=ce.learner_person_id
       JOIN education_v30_secure.formative_practice_responses pr
         ON pr.practice_attempt_id=fp.id
       WHERE ce.class_id=${cls.id}::uuid
         AND ca.status='active' AND ca.section_id IS NULL
         AND fp.course_version_id=${cls.courseVersionId}::uuid
         AND pr.response->>'mode'='valor_draft_assessment_practice'
         AND p.metadata @> '{"synthetic":true}'::jsonb
       ORDER BY fp.recorded_at DESC,fp.id DESC
       LIMIT 51
     `);
     const items=result.rows.slice(0,50).map(row=>{
       const raw=asRecord(row.response);
       const answers=Array.isArray(raw.responses)
         ?raw.responses.flatMap(answer=>{
           const value=asRecord(answer);
           return typeof value.promptText==="string"&&typeof value.response==="string"
             ?[{prompt:value.promptText,answer:value.response}]:[];
         }):[];
       return {
         id:String(row.id),studentName:String(row.studentName??"Learner"),
         recordedAt:new Date(String(row.recordedAt)).toISOString(),answers,
         teacherFeedback:typeof raw.teacherFeedback==="string"?raw.teacherFeedback:null,
         practiceScore:typeof raw.demoScore==="number"?raw.demoScore:null,
       };
     });
     return {items,partial:result.rows.length>50};
   });
 });


const practiceReviewInput=input.extend({
  practiceAttemptId:z.string().uuid(),
  feedback:z.string().trim().min(3).max(3000),
  practiceScore:z.number().int().min(0).max(10).nullable(),
}).strict();

/** Teacher review of genuine saved synthetic draft-practice responses. The
 * academic assessment remains draft. An audit accompanies any returned
 * practice-only feedback; this grants no official grading authority.
 */
export const returnNativeClassDraftPracticeFeedback=createServerFn({method:"POST"})
 .validator((value:unknown)=>practiceReviewInput.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const {cls,actor}=await authorizedTeacher(tx,data.classId);
     if(cls.siteId!=="f1000000-0000-4000-8000-000000000003")
       throw new AuthorizationError("synthetic Valor practice review only");
     const matched=await tx.execute(sql`
       SELECT fp.id
       FROM public.formative_practice_attempts fp
       JOIN public.learner_course_attempts ca ON ca.id=fp.course_attempt_id
         AND ca.course_version_id=fp.course_version_id
       JOIN public.class_enrollments ce ON ce.id=ca.class_enrollment_id
         AND ce.course_attempt_id=ca.id AND ce.status='active'
       JOIN public.people p ON p.id=ce.learner_person_id
       JOIN public.sites s ON s.id=${cls.siteId}::uuid
       JOIN education_v30_secure.formative_practice_responses pr
         ON pr.practice_attempt_id=fp.id
       WHERE fp.id=${data.practiceAttemptId}::uuid
         AND ce.class_id=${cls.id}::uuid
         AND ca.status='active' AND ca.section_id IS NULL
         AND fp.course_version_id=${cls.courseVersionId}::uuid
         AND p.metadata @> '{"synthetic":true}'::jsonb
         AND s.metadata @> '{"synthetic":true}'::jsonb
         AND pr.response->>'mode'='valor_draft_assessment_practice'
       FOR UPDATE OF pr
     `);
     if(matched.rows.length!==1)
       throw new AuthorizationError("exact private synthetic practice response");
     const updated=await tx.execute(sql`
       UPDATE education_v30_secure.formative_practice_responses
       SET response=response || jsonb_build_object(
         'teacherFeedback',${data.feedback}::text,
         'demoScore',${data.practiceScore}::int,
         'maxDemoScore',10
       )
       WHERE practice_attempt_id=${data.practiceAttemptId}::uuid
         AND response->>'mode'='valor_draft_assessment_practice'
       RETURNING practice_attempt_id
     `);
     if(updated.rows.length!==1)
       throw new AuthorizationError("practice response changed");
     await writeCanonicalAudit(tx,{
       actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
       eventCode:"class.knowledge_check.practice_feedback.recorded",
       entityKind:"formative_practice_attempt",entityId:data.practiceAttemptId,
       payload:{classId:cls.id,practiceOnly:true,scoreRecorded:data.practiceScore!==null},
     });
     return {practiceAttemptId:data.practiceAttemptId,practiceOnly:true as const};
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
