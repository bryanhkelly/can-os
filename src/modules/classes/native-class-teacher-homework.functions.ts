import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";
import { getIdentityContext } from "@/modules/identity/command-context.server";

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
  // This teacher review surface requires an actual direct CAN teacher
  // login. An otherwise valid native provider or room bearer cannot stand
  // in for an assigned academic teacher's personal account.
  const can=await getIdentityContext(getRequest());
  if(can.role!=="teacher" || can.sessionAccountId ||
      !can.actorPersonId || can.actorPersonId!==actor.actorPersonId ||
      can.grantSiteId!==actor.scope.siteIds[0] ||
      can.scope.organizationIds?.length!==1 ||
      can.scope.organizationIds[0]!==actor.scope.organizationIds[0] ||
      !can.capabilities.has("teacher:read"))
    throw new AuthorizationError("current direct CAN teacher Session");
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
  return cls;
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
     const cls=await authorizedTeacher(tx,data.classId);
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
           submittedAt:row.submitted_at?.toISOString()??null,
         };
       }),
       partial:result.rows.length>100,
       canRecordOfficialGrade:false,
       notice:"Viewing submitted work does not confer independent grading authority. Official grading requires a verified independent grader appointment and governed Course policy.",
     };
   });
 });

/** Review readiness only. Draft questions, hidden keys, personal learner
 * attempts and official grading appointments are not exposed here. */
export const getNativeClassTeacherAssessments=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const cls=await authorizedTeacher(tx,data.classId);
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

const returnInput=input.extend({
  submissionId:z.string().uuid(),
  feedback:z.string().trim().min(10).max(2000),
}).strict();

/** Synthetic classroom revision request: preserve the learner's response
 * verbatim, update only an already-submitted canonical row, and audit the
 * instruction. This is NOT a grading_decision, official score or credential.
 * Production grading remains guarded by independent verified capability. */
export const returnNativeClassHomeworkForRevision=createServerFn({method:"POST"})
 .validator((raw:unknown)=>returnInput.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   return db.transaction(async tx=>{
     const cls=await authorizedTeacher(tx,data.classId);
     // Explicit opt-in to the fictional Valor tenant for this new workflow.
     const synthetic=await tx.execute(sql`
       SELECT id FROM public.sites
       WHERE id=${cls.siteId}::uuid
         AND id='f1000000-0000-4000-8000-000000000003'::uuid
         AND metadata @> '{"synthetic":true}'::jsonb
       LIMIT 1
     `);
     if(synthetic.rows.length!==1)
       throw new AuthorizationError("synthetic Valor revision scenario only");
     const previous=await tx.execute(sql`
       SELECT gs.id,gs.status,gs.response
       FROM public.graded_submissions gs
       JOIN public.learner_course_attempts ca
         ON ca.id=gs.course_attempt_id
        AND ca.course_version_id=gs.course_version_id
        AND ca.status='active' AND ca.section_id IS NULL
       JOIN public.class_enrollments ce
         ON ce.id=ca.class_enrollment_id
        AND ce.course_attempt_id=ca.id
        AND ce.status='active'
       JOIN public.graded_assignments ga
         ON ga.id=gs.assignment_id
        AND ga.course_version_id=ca.course_version_id
        AND ga.section_id IS NULL
       WHERE gs.id=${data.submissionId}::uuid
         AND ce.class_id=${cls.id}::uuid
         AND ca.course_version_id=${cls.courseVersionId}::uuid
         AND gs.status='submitted'
       FOR UPDATE OF gs
     `);
     if(previous.rows.length!==1)
       throw new AuthorizationError("current submitted homework in your exact Class");
     // Recheck session, Course publication and named appointment AFTER the
     // learner submission has been locked.
     const current=await authorizedTeacher(tx,data.classId);
     if(current.id!==cls.id)
       throw new AuthorizationError("unchanged current teacher Class authority");
     const changed=await tx.execute(sql`
       UPDATE public.graded_submissions
       SET status='returned',
           response=response||jsonb_build_object(
             'teacherFeedback',${data.feedback},
             'feedbackKind','synthetic_revision_request',
             'synthetic',true,
             'noncredit',true)
       WHERE id=${data.submissionId}::uuid AND status='submitted'
       RETURNING id
     `);
     if(changed.rows.length!==1)
       throw new AuthorizationError("homework state changed; refresh and retry");
     const actor=await getCanonicalCommandContext(getRequest());
     await writeCanonicalAudit(tx,{
       actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
       eventCode:"valor.synthetic_homework.returned_for_revision",
       entityKind:"graded_submission",entityId:data.submissionId,
       payload:{classId:cls.id,synthetic:true,officialGradeIssued:false},
     });
     return {submissionId:data.submissionId,status:"returned" as const};
   });
 });
