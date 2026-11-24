import { projectSubmissionRevisionPage } from "@/domain/submission-revisions";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const uuid = z.string().uuid();
const target = z.object({ classEnrollmentId: uuid }).strict();
const submit = target.extend({
  assignmentId: uuid,
  responseText: z.string().trim().min(5).max(20000),
}).strict();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

type HomeworkRow = {
  id: string;
  assignment_key: string;
  assignment_spec: unknown;
  official_spec: unknown;
  due_at: Date | null;
  submission_id: string | null;
  status: string | null;
  response: unknown;
  submitted_at: Date | null;
};
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

/** One authorized assignment query; the index never reads submission text or feedback. */
async function readHomeworkRows(tx:Tx,courseVersionId:string,courseAttemptId:string,detail:boolean):Promise<HomeworkRow[]>{
  const result = await tx.execute(sql`
        SELECT a.id, a.assignment_key, ${detail ? sql`a.assignment_spec` : sql`jsonb_build_object('title',a.assignment_spec->'title')`} AS assignment_spec, a.due_at,
          ${detail ? sql`o.official_spec` : sql`jsonb_build_object('title',o.official_spec->'title')`} AS official_spec,
          s.id AS submission_id, s.status, ${detail ? sql`s.response` : sql`NULL::jsonb`} AS response, s.submitted_at
        FROM public.graded_assignments a
        JOIN public.official_course_assignment_versions o
          ON o.id=a.official_assignment_version_id
         AND o.course_version_id=a.course_version_id
        LEFT JOIN public.graded_submissions s
          ON s.assignment_id=a.id AND s.course_attempt_id=${courseAttemptId}::uuid
        WHERE a.course_version_id=${courseVersionId}::uuid
          AND a.section_id IS NULL
        ORDER BY a.due_at NULLS LAST, a.assignment_key
        LIMIT 100
      `);
  return result.rows as HomeworkRow[];
}

function homeworkSummary(item:HomeworkRow){
  const spec=asRecord(item.assignment_spec);
  const official=asRecord(item.official_spec);
  return {
    id:String(item.id),
    title:String(spec.title??official.title??item.assignment_key),
    dueAt:item.due_at ? new Date(item.due_at).toISOString() : null,
    status:item.status??"not_started",
    submittedAt:item.submitted_at ? new Date(item.submitted_at).toISOString() : null,
  };
}

/** Minimal DTO for the authenticated student assignment index. */
export const getNativeClassHomeworkSummary=createServerFn({method:"GET"})
  .validator((raw:unknown)=>target.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
      const rows=await readHomeworkRows(tx,cls.courseVersionId,courseAttemptId,false);
      return {assignments:rows.map(homeworkSummary)};
    });
  });

export const getNativeClassHomework = createServerFn({method:"GET"})
  .validator((raw: unknown) => target.parse(raw))
  .handler(async ({data}) => {
    noStore();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const {cls,enrollment,courseAttemptId} = await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
      const rows = await readHomeworkRows(tx,cls.courseVersionId,courseAttemptId,true);
      // Preserve access to original academic evidence during the cutover.
      // Exact recovery provenance only; no title inference or new enrollment.
      const legacy = actor.role==="student" ? await tx.execute(sql`
        SELECT DISTINCT sec.id AS section_id
        FROM public.enrollments e
        JOIN public.student_profiles sp ON sp.id=e.student_profile_id
        JOIN public.sections sec ON sec.id=e.section_id
        WHERE sp.person_id=${enrollment.learnerPersonId}::uuid
          AND e.kind='section' AND e.status='active'
          AND sec.site_id=${cls.siteId}::uuid
          AND e.organization_id=${cls.operatingOrganizationId}::uuid
          AND md5('valor-v61:classenrollment:'||e.id)::uuid=${enrollment.id}::uuid
          AND md5('valor-v61:class:'||sec.code)::uuid=${cls.id}::uuid
        LIMIT 2
      `) : null;
      const legacySectionId=legacy?.rows.length===1?String(legacy.rows[0]?.section_id):null;
      return {courseAttemptId, legacySectionId, assignments:rows.map(item => {
        const spec=asRecord(item.assignment_spec);
        const official=asRecord(item.official_spec);
        const response=asRecord(item.response);
        return {
          ...homeworkSummary(item),
          instructions:String(spec.instructions??official.instructions??"Submit your written response."),
          responseText:typeof response.text==="string"?response.text:"",
          practiceFeedback:response.practiceResponse===true&&typeof response.teacherFeedback==="string"
            ?response.teacherFeedback:null,
          practiceScore:response.practiceResponse===true
            ?(typeof response.practiceScore==="number"?response.practiceScore:
              typeof response.demoScore==="number"?response.demoScore:null):null,
          practiceScoreMax:response.practiceResponse===true
            ?(typeof response.practiceScoreMax==="number"?response.practiceScoreMax:
              typeof response.maxDemoScore==="number"?response.maxDemoScore:null):null,
          submitted:!!item.submission_id,
        };
      })};
    });
  });

/** Read a bounded page of the learner's own preserved submission states.
 * The parent homework service owns authorization; no separate identity path. */
export const getNativeClassHomeworkHistory=createServerFn({method:"GET"})
  .validator((raw:unknown)=>target.extend({
    assignmentId:uuid,beforeRevision:z.number().int().positive().optional(),
  }).strict().parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx=>{
      const {cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read");
      const result=await tx.execute(sql`
        SELECT r.revision_no,r.status,r.response,r.submitted_at,r.recorded_at,r.source
        FROM public.graded_submission_revisions r
        JOIN public.graded_submissions gs ON gs.id=r.submission_id AND gs.course_version_id=r.course_version_id
        JOIN public.graded_assignments ga ON ga.id=gs.assignment_id AND ga.course_version_id=gs.course_version_id
        WHERE gs.course_attempt_id=${courseAttemptId}::uuid
          AND gs.course_version_id=${cls.courseVersionId}::uuid
          AND ga.id=${data.assignmentId}::uuid AND ga.section_id IS NULL
          AND (${data.beforeRevision??null}::int IS NULL OR r.revision_no<${data.beforeRevision??null}::int)
        ORDER BY r.revision_no DESC LIMIT 21
      `);
      return projectSubmissionRevisionPage(result.rows);
    });
  });

/** Persist text homework in the EXISTING graded_submissions table. A submitted
 * or graded response is never silently overwritten. Repeated identical
 * submissions return an idempotent acknowledgement. */
export const submitNativeClassHomework = createServerFn({method:"POST"})
  .validator((raw:unknown)=>submit.parse(raw))
  .handler(async({data})=>{
    noStore();
    const actor=await getInstructionalLearnerContext(getRequest());
    if(!(actor.role==="student"&&actor.capabilities.has("assignments:submit") ||
         actor.role==="learner"&&actor.capabilities.has("learning.participate")))
      throw new AuthorizationError("own homework submission capability");
    return db.transaction(async tx=>{
      const {enrollment,cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write");
      // Ordinary non-credit Class assignments may receive private, unscored
      // teacher feedback. This is determined by the current Enrollment's
      // credit mode, never by a synthetic Site/Person marker or demo email.
      const practiceOnly=enrollment.creditMode==="not_applicable";
      const responseValue=JSON.stringify({
        text:data.responseText,format:"text",
        ...(practiceOnly?{practiceResponse:true}:{}),
      });
      const assignment=await tx.execute(sql`
        SELECT a.id FROM public.graded_assignments a
        JOIN public.official_course_assignment_versions o
          ON o.id=a.official_assignment_version_id
         AND o.course_version_id=a.course_version_id
        WHERE a.id=${data.assignmentId}::uuid
          AND a.course_version_id=${cls.courseVersionId}::uuid
          AND a.section_id IS NULL
        LIMIT 1
      `);
      if(assignment.rows.length!==1)throw new AuthorizationError("homework in this exact Course");
      const previous=await tx.execute(sql`
        SELECT id,status,response FROM public.graded_submissions
        WHERE course_attempt_id=${courseAttemptId}::uuid
          AND assignment_id=${data.assignmentId}::uuid
        FOR UPDATE
      `);
      const prior=previous.rows[0] as {id:string;status:string;response:unknown}|undefined;
      if(prior){
        if(prior.status==="submitted"){
          if(asRecord(prior.response).text===data.responseText)
            return {submissionId:prior.id,alreadySubmitted:true};
          throw new AuthorizationError("already submitted; request a revision from your teacher");
        }
        if(prior.status!=="assigned" && prior.status!=="returned")
          throw new AuthorizationError("this submission cannot be edited");
        const next=await tx.execute(sql`
          UPDATE public.graded_submissions
          SET response=${responseValue}::jsonb,
              status='submitted',submitted_at=now()
          WHERE id=${prior.id}::uuid AND status IN ('assigned','returned')
          RETURNING id
        `);
        if(next.rows.length!==1)throw new AuthorizationError("submission changed; reload");
        await writeCanonicalAudit(tx,{
          actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
          eventCode:"class.homework.submitted",entityKind:"graded_submission",entityId:prior.id,
          payload:{classId:cls.id,assignmentId:data.assignmentId,courseAttemptId,revised:true},
        });
        return {submissionId:prior.id,alreadySubmitted:false};
      }
      const inserted=await tx.execute(sql`
        INSERT INTO public.graded_submissions
          (course_attempt_id,course_version_id,assignment_id,submitted_at,status,response)
        VALUES (${courseAttemptId}::uuid,${cls.courseVersionId}::uuid,
          ${data.assignmentId}::uuid,now(),'submitted',
          ${responseValue}::jsonb)
        ON CONFLICT (course_attempt_id,assignment_id) DO NOTHING
        RETURNING id
      `);
      const created=inserted.rows[0] as {id:string}|undefined;
      if(!created)throw new AuthorizationError("simultaneous homework submission; reload before retry");
      await writeCanonicalAudit(tx,{
        actorPersonId:actor.actorPersonId!,owningOrganizationId:cls.operatingOrganizationId,
        eventCode:"class.homework.submitted",entityKind:"graded_submission",entityId:created.id,
        payload:{classId:cls.id,assignmentId:data.assignmentId,courseAttemptId,revised:false},
      });
      return {submissionId:created.id,alreadySubmitted:false};
    });
  });
