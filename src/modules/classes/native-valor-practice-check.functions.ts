import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClassEnrollments, canonicalClasses } from "@/db/canonical-v301";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { AuthorizationError } from "@/domain/command-context";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const target = z.object({classEnrollmentId:z.string().uuid()}).strict();
const submission = target.extend({
  responses:z.array(z.object({
    questionId:z.string().uuid(),
    text:z.string().trim().min(3).max(4000),
  }).strict()).min(1).max(10),
}).strict();
const VALOR_SITE="f1000000-0000-4000-8000-000000000003";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

function noStore(){
  setResponseHeader("Cache-Control","private, no-store");
  setResponseHeader("Referrer-Policy","no-referrer");
}

/**
 * Practice preview of existing Valor draft assessment questions only.
 * Official canonical assessment administrations, grants, grade decisions and
 * keys remain untouched. Student identity and active Course Attempt are
 * authorized using the existing native Class access path.
 */
async function scope(tx:Tx,classEnrollmentId:string){
  const actor=await getInstructionalLearnerContext(getRequest());
  if(actor.role!=="student"||!actor.actorPersonId||
     !actor.capabilities.has("student:read"))
    throw new AuthorizationError("CAN student practice access");
  const [enrollment]=await tx.select().from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id,classEnrollmentId),
      eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId),
      eq(canonicalClassEnrollments.status,"active"))).limit(1);
  if(!enrollment?.courseAttemptId)throw new AuthorizationError("active native Class Enrollment");
  const [cls]=await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id,enrollment.classId)).limit(1);
  if(!cls||cls.state!=="active"||cls.siteId!==VALOR_SITE||
      actor.scope.siteIds?.[0]!==cls.siteId||
      !actor.scope.organizationIds?.includes(cls.operatingOrganizationId))
    throw new AuthorizationError("current synthetic Valor Class");
  const participant=await authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId);
  if(participant.source!=="class"||participant.courseVersionId!==cls.courseVersionId)
    throw new AuthorizationError("own active canonical Course Attempt");
  const synthetic=await tx.execute(sql`
    SELECT EXISTS(
      SELECT 1 FROM public.people p JOIN public.sites s ON s.id=${cls.siteId}::uuid
      WHERE p.id=${actor.actorPersonId}::uuid
        AND p.metadata @> '{"synthetic":true}'::jsonb
        AND s.metadata @> '{"synthetic":true}'::jsonb
    ) AS authorized
  `);
  if(synthetic.rows[0]?.authorized!==true)
    throw new AuthorizationError("verified synthetic demonstration participant");
  return { actor,cls,courseAttemptId:participant.courseAttemptId };
}

type ItemRow={
  administration_id:string;assessment_version_id:string;course_unit_id:string;
  id:string;prompt:unknown;
};
async function draftQuestions(tx:Tx,courseVersionId:string,deploymentId:string,organizationId:string){
  const rows=await tx.execute(sql`
    SELECT aa.id AS administration_id,av.id AS assessment_version_id,
      (SELECT cu.id FROM public.course_units cu
       WHERE cu.course_version_id=${courseVersionId}::uuid
       ORDER BY cu.sequence_no,cu.id LIMIT 1) AS course_unit_id,
      iv.id,iv.item_prompt AS prompt
    FROM public.assessment_administrations aa
    JOIN public.assessment_versions av ON av.id=aa.assessment_version_id
    JOIN public.assessment_form_versions fv ON fv.id=aa.form_version_id
      AND fv.assessment_version_id=av.id
    JOIN public.assessment_form_items fi ON fi.form_version_id=fv.id
    JOIN public.assessment_item_versions iv ON iv.id=fi.item_version_id
    WHERE aa.course_version_id=${courseVersionId}::uuid
      AND aa.deployment_id=${deploymentId}::uuid
      AND aa.administering_organization_id=${organizationId}::uuid
      AND aa.administration_code LIKE 'valor.demo.%.draft.preflight'
      AND aa.status='draft' AND av.lifecycle='draft'
      AND fv.lifecycle='draft' AND iv.lifecycle='draft'
      AND iv.response_kind='short_text'
      AND iv.item_prompt @> '{"synthetic":true}'::jsonb
    ORDER BY fi.position,fi.id
    LIMIT 11
  `);
  const items=rows.rows as ItemRow[];
  if(!items.length||items.length>10||
     new Set(items.map(x=>x.administration_id)).size!==1||
     !items[0]?.course_unit_id)return null;
  return items.map(row=>{
    const value=row.prompt&&typeof row.prompt==="object"&&!Array.isArray(row.prompt)
      ?row.prompt as Record<string,unknown>:{};
    return {
      id:String(row.id),prompt:typeof value.text==="string"?value.text:"",
      administrationId:String(row.administration_id),
      assessmentVersionId:String(row.assessment_version_id),
      courseUnitId:String(row.course_unit_id),
    };
  });
}

async function history(tx:Tx,courseAttemptId:string,assessmentVersionId:string){
  const rows=await tx.execute(sql`
    SELECT fp.id,fp.recorded_at,
      (r.response -> 'responses') AS responses
    FROM public.formative_practice_attempts fp
    JOIN education_v30_secure.formative_practice_responses r
      ON r.practice_attempt_id=fp.id
    WHERE fp.course_attempt_id=${courseAttemptId}::uuid
      AND r.response->>'mode'='valor_draft_assessment_practice'
      AND r.response->>'assessmentVersionId'=${assessmentVersionId}
    ORDER BY fp.recorded_at DESC,fp.id DESC LIMIT 10
  `);
  return rows.rows.map(row=>({
    id:String(row.id),recordedAt:new Date(String(row.recorded_at)).toISOString(),
    responses:Array.isArray(row.responses)
      ?row.responses.map((entry:unknown)=>{
        const r=entry&&typeof entry==="object"&&!Array.isArray(entry)
          ?entry as Record<string,unknown>:{};
        return {
          promptText:String(r.promptText??""),
          response:String(r.response??""),
        };
      }):[],
  }));
}

export const getNativeValorPracticeCheck=createServerFn({method:"GET"})
 .validator((raw:unknown)=>target.parse(raw))
 .handler(async({data})=>{
   noStore();
   return db.transaction(async tx=>{
     const {cls,courseAttemptId}=await scope(tx,data.classEnrollmentId);
     const questions=await draftQuestions(tx,cls.courseVersionId,cls.deploymentId,cls.operatingOrganizationId);
     if(!questions)return {available:false as const,questions:[],history:[]};
     return {available:true as const,
       questions:questions.map(({id,prompt})=>({id,prompt})),
       history:await history(tx,courseAttemptId,questions[0]!.assessmentVersionId)};
   });
 });

export const submitNativeValorPracticeCheck=createServerFn({method:"POST"})
 .validator((raw:unknown)=>submission.parse(raw))
 .handler(async({data})=>{
   noStore();
   return db.transaction(async tx=>{
     const {actor,cls,courseAttemptId}=await scope(tx,data.classEnrollmentId);
     const questions=await draftQuestions(tx,cls.courseVersionId,cls.deploymentId,cls.operatingOrganizationId);
     if(!questions||questions.length!==data.responses.length)
       throw new AuthorizationError("complete matching synthetic practice questions");
     const byId=new Map(data.responses.map(response=>[response.questionId,response.text]));
     if(byId.size!==questions.length||questions.some(q=>!byId.has(q.id)))
       throw new AuthorizationError("practice answer and question correspondence");
     const answers=questions.map(q=>({
       promptKey:q.id,promptText:q.prompt,response:byId.get(q.id)!,
     }));
     // Use the canonical formative-practice store, not assessment_attempts,
     // result decisions, graded_submissions, or a newly invented quiz table.
     const created=await tx.execute(sql`
       INSERT INTO public.formative_practice_attempts
         (course_attempt_id,course_version_id,course_unit_id,score_numeric)
       VALUES (${courseAttemptId}::uuid,${cls.courseVersionId}::uuid,
         ${questions[0]!.courseUnitId}::uuid,NULL)
       RETURNING id
     `);
     const id=String(created.rows[0]?.id??"");
     if(!z.string().uuid().safeParse(id).success)
       throw new Error("Practice response could not be recorded.");
     await tx.execute(sql`
       INSERT INTO education_v30_secure.formative_practice_responses
         (practice_attempt_id,response,privacy_class)
       VALUES (${id}::uuid,${JSON.stringify({
         mode:"valor_draft_assessment_practice",
         assessmentVersionId:questions[0]!.assessmentVersionId,
         responses:answers,
       })}::jsonb,'restricted')
     `);
     await writeCanonicalAudit(tx,{
       actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
       eventCode:"class.knowledge_check.practice_submitted",
       entityKind:"formative_practice_attempt",entityId:id,
       payload:{
         classId:cls.id,courseAttemptId,assessmentVersionId:questions[0]!.assessmentVersionId,
         synthetic:true,practiceOnly:true,questionCount:answers.length,
       },
     });
     return {practiceAttemptId:id,practiceOnly:true as const};
   });
 });
