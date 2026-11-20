import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClassEnrollments, canonicalClasses } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { getInstructionalLearnerContext } from "@/modules/identity/learning-command-context.server";
import { authorizeCanonicalCourseAttempt } from "@/modules/learning/canonical-course-participation.server";
import { writeCanonicalAudit } from "@/platform/canonical-mutation.server";

const uuid = z.string().uuid();
const target = z.object({ classEnrollmentId: uuid }).strict();
const submit = target.extend({
  assignmentId: uuid,
  responseText: z.string().trim().min(5).max(20000),
}).strict();
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = Awaited<ReturnType<typeof getInstructionalLearnerContext>>;

function noStore() {
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

/** Homework belongs to an exact active Class Enrollment and one Course Attempt.
 * No legacy Section lookup, surrogate student identity or extra submission table. */
async function authorized(tx: Tx, actor: Actor, classEnrollmentId: string) {
  if (!actor.actorPersonId ||
      !(actor.role === "student" && actor.capabilities.has("student:read") ||
        actor.role === "learner" && actor.capabilities.has("learning.participate"))) {
    throw new AuthorizationError("own authenticated Course learner");
  }
  const [enrollment] = await tx.select().from(canonicalClassEnrollments)
    .where(and(eq(canonicalClassEnrollments.id, classEnrollmentId),
      eq(canonicalClassEnrollments.learnerPersonId, actor.actorPersonId),
      eq(canonicalClassEnrollments.status, "active")))
    .for("update").limit(1);
  if (!enrollment?.courseAttemptId) throw new AuthorizationError("active Class Enrollment and Course Attempt");
  const [cls] = await tx.select().from(canonicalClasses)
    .where(eq(canonicalClasses.id, enrollment.classId)).limit(1);
  if (!cls || cls.state !== "active") throw new AuthorizationError("current Class");
  if (actor.role === "student" && (actor.scope.siteIds?.[0] !== cls.siteId ||
      !actor.scope.organizationIds?.includes(cls.operatingOrganizationId))) {
    throw new AuthorizationError("own CAN student Site");
  }
  const access = await authorizeCanonicalCourseAttempt(tx, actor, enrollment.courseAttemptId);
  if (access.source !== "class" || access.courseVersionId !== cls.courseVersionId)
    throw new AuthorizationError("own canonical Class Course Attempt");
  return { enrollment, cls, courseAttemptId: access.courseAttemptId };
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

export const getNativeClassHomework = createServerFn({method:"GET"})
  .validator((raw: unknown) => target.parse(raw))
  .handler(async ({data}) => {
    noStore();
    const actor = await getInstructionalLearnerContext(getRequest());
    return db.transaction(async tx => {
      const {cls,courseAttemptId} = await authorized(tx,actor,data.classEnrollmentId);
      const result = await tx.execute(sql`
        SELECT a.id, a.assignment_key, a.assignment_spec, a.due_at,
          o.official_spec, s.id AS submission_id, s.status, s.response, s.submitted_at
        FROM public.graded_assignments a
        JOIN public.official_course_assignment_versions o
          ON o.id=a.official_assignment_version_id
         AND o.course_version_id=a.course_version_id
        LEFT JOIN public.graded_submissions s
          ON s.assignment_id=a.id AND s.course_attempt_id=${courseAttemptId}::uuid
        WHERE a.course_version_id=${cls.courseVersionId}::uuid
          AND a.section_id IS NULL
        ORDER BY a.due_at NULLS LAST, a.assignment_key
        LIMIT 100
      `);
      return {courseAttemptId, assignments:(result.rows as HomeworkRow[]).map(item => {
        const spec=asRecord(item.assignment_spec);
        const official=asRecord(item.official_spec);
        const response=asRecord(item.response);
        return {
          id:String(item.id),
          title:String(spec.title??official.title??item.assignment_key),
          instructions:String(spec.instructions??official.instructions??"Submit your written response."),
          dueAt:item.due_at ? new Date(item.due_at).toISOString() : null,
          status:item.status??"not_started",
          submittedAt:item.submitted_at?.toISOString()??null,
          responseText:typeof response.text==="string"?response.text:"",
          practiceFeedback:response.synthetic===true&&typeof response.teacherFeedback==="string"
            ?response.teacherFeedback:null,
          practiceScore:response.synthetic===true&&typeof response.demoScore==="number"
            ?response.demoScore:null,
          practiceScoreMax:response.synthetic===true&&typeof response.maxDemoScore==="number"
            ?response.maxDemoScore:null,
          submitted:!!item.submission_id,
        };
      })};
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
      const {cls,courseAttemptId}=await authorized(tx,actor,data.classEnrollmentId);
      // Real submissions to the fictional Valor Site must remain explicitly
      // noncredit/synthetic so Riley can return practice feedback without
      // accidentally manufacturing a grade or overwriting official evidence.
      const demo=cls.siteId==="f1000000-0000-4000-8000-000000000003"
        ?await tx.execute(sql`
          SELECT EXISTS(SELECT 1 FROM public.people p
            JOIN public.sites s ON s.id=${cls.siteId}::uuid
            WHERE p.id=${actor.actorPersonId}::uuid
              AND p.metadata @> '{"synthetic":true}'::jsonb
              AND s.metadata @> '{"synthetic":true}'::jsonb) AS eligible
        `)
        :null;
      const syntheticPractice=demo?.rows[0]?.eligible===true;
      const responseValue=JSON.stringify({
        text:data.responseText,format:"text",
        ...(syntheticPractice
          ?{synthetic:true,practiceResponse:true,noncredit:true}
          :{}),
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
