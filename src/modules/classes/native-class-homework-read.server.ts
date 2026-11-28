import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { CommandContext } from "@/domain/command-context";
import { authorizeNativeLearnerClass } from "./native-learner-class-access.server";
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : {};

/** One authorized assignment query; the index never reads submission text or feedback. */
export async function readHomeworkRows(tx:Tx,courseVersionId:string,courseAttemptId:string,detail:boolean):Promise<HomeworkRow[]>{
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

export function homeworkSummary(item:HomeworkRow){
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

export async function readNativeClassHomeworkSummary(actor:CommandContext,classEnrollmentId:string){
    return db.transaction(async tx=>{
      const {cls,courseAttemptId}=await authorizeNativeLearnerClass(tx,actor,classEnrollmentId,"active_read");
      const rows=await readHomeworkRows(tx,cls.courseVersionId,courseAttemptId,false);
      return {assignments:rows.map(homeworkSummary)};
    });
}

/** Own current assignment workspace, including only this attempt's response and feedback. */
export async function readNativeClassHomework(actor:CommandContext,classEnrollmentId:string){
    return db.transaction(async tx => {
      const {cls,enrollment,courseAttemptId} = await authorizeNativeLearnerClass(tx,actor,classEnrollmentId,"active_read");
      const rows = await readHomeworkRows(tx,cls.courseVersionId,courseAttemptId,true);
      // Preserve access to original academic evidence during the cutover.
      // Exact recovery provenance only; no title inference or new enrollment.
      const legacy = actor.role==="student" ? await tx.execute(sql`
        SELECT DISTINCT sec.id AS section_id
        FROM public.academic_enrollment_cutover_links link
        JOIN public.enrollments e ON e.id=link.legacy_enrollment_id
        JOIN public.student_profiles sp ON sp.id=e.student_profile_id
        JOIN public.sections sec ON sec.id=e.section_id
        WHERE sp.person_id=${enrollment.learnerPersonId}::uuid
          AND e.kind='section' AND e.status='active'
          AND sec.site_id=${cls.siteId}::uuid
          AND e.organization_id=${cls.operatingOrganizationId}::uuid
          AND link.class_enrollment_id=${enrollment.id}::uuid
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
}
