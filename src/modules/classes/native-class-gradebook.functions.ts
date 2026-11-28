import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {sql} from "drizzle-orm";
import {z} from "zod";
import {db} from "@/db/client";
import {getCanonicalCommandContext} from "@/modules/identity/canonical-command-context.server";
import {assertNativeClassTeacher} from "./native-class-teacher-authority.server";
import {nativeClassWorkRows} from "./native-class-work-query.server";

const input=z.object({classId:z.string().uuid(),
  offset:z.number().int().min(0).max(1000000).default(0)}).strict();

/** Teacher-only view of existing immutable decisions, not a grade release
 * or authority to grade. Never infer an official grade from a practice
 * response, submission status, quiz result or attendance. Multiple current
 * decision heads are an integrity issue, not a reason to choose a winner. */
export const getNativeClassTeacherGradebook=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.parse(raw))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   const actor=await getCanonicalCommandContext(getRequest());
   return db.transaction(async tx=>{
     const cls=await assertNativeClassTeacher(tx,actor,data.classId);
     const result=await tx.execute(sql`
       SELECT w.enrollment_id,w.assignment_id,w.title,
         coalesce(w.submission_status,'not_started') AS submission_status,
         p.preferred_name,p.legal_first_name,p.legal_last_name,
         coalesce(d.head_count,0)::int AS head_count,
         d.decision,d.score,d.decided_at,d.policy_key,
         coalesce(gs.response @> '{"practiceResponse":true}'::jsonb,false) AS practice_only
       FROM (${nativeClassWorkRows([cls.id])}) w
       JOIN public.people p ON p.id=w.learner_person_id
       LEFT JOIN public.graded_submissions gs ON gs.id=w.submission_id
       LEFT JOIN LATERAL (
         SELECT count(*) OVER() AS head_count,g.decision,g.score::text AS score,
           g.decided_at,policy.policy_key
         FROM public.grading_decisions g
         JOIN public.course_grading_policy_versions policy
           ON policy.id=g.course_grading_policy_version_id AND policy.course_version_id=g.course_version_id
         WHERE g.graded_submission_id=w.submission_id
           AND g.course_version_id=${cls.courseVersionId}::uuid
           AND NOT EXISTS (SELECT 1 FROM public.grading_decisions successor
             WHERE successor.supersedes_decision_id=g.id)
         ORDER BY g.decided_at DESC,g.id DESC LIMIT 1
       ) d ON true
       ORDER BY w.enrollment_id,w.assignment_id LIMIT 101 OFFSET ${data.offset}
     `);
     const rows=result.rows as Array<{
       enrollment_id:string;assignment_id:string;title:string;submission_status:string;
       preferred_name:string|null;legal_first_name:string|null;legal_last_name:string|null;
       head_count:number;decision:string|null;score:string|null;decided_at:Date|string|null;
       policy_key:string|null;practice_only:boolean;
     }>;
     return {classId:cls.id,canRecordOfficialGrade:false,
       items:rows.slice(0,100).map(row=>{
         const heads=Number(row.head_count);
         const integrityIssue=heads>1||heads>0&&row.practice_only||
           row.submission_status==="graded"&&heads!==1;
         const officialDecision=!integrityIssue&&heads===1?row.decision:null;
         return {
           classEnrollmentId:row.enrollment_id,assignmentId:row.assignment_id,
           assignmentTitle:row.title,
           studentName:row.preferred_name??([row.legal_first_name,row.legal_last_name].filter(Boolean).join(" ")||"Learner"),
           submissionStatus:row.submission_status,practiceOnly:row.practice_only,
           officialDecision,integrityIssue,
           officialScore:officialDecision==="graded"||officialDecision==="corrected"?row.score:null,
           policyKey:officialDecision?row.policy_key:null,
           decidedAt:officialDecision&&row.decided_at?new Date(row.decided_at).toISOString():null,
         };
       }),nextOffset:rows.length>100?data.offset+100:null};
   });
 });
