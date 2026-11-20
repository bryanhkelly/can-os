import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { canonicalClasses, canonicalClassStaffAssignments } from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { currentClassAuthority } from "./native-class-authority.server";

const input=z.object({classId:z.string().uuid()}).strict();
const asRecord=(value:unknown):Record<string,unknown>=>
  value && typeof value==="object" && !Array.isArray(value)
    ?value as Record<string,unknown>:{};
type HomeworkRow={
  id:string;status:string;submitted_at:Date|null;
  assignment_key:string;assignment_spec:unknown;response:unknown;
  first_name:string|null;last_name:string|null;preferred_name:string|null;
};

/** Independent academic teacher queue, using only the current native Class
 * and Course Attempt. This read does not turn a teacher appointment into an
 * independent grader authorization, and cannot alter grades or submissions.
 */
export const getNativeClassTeacherHomework=createServerFn({method:"GET"})
 .validator((value:unknown)=>input.parse(value))
 .handler(async({data})=>{
   setResponseHeader("Cache-Control","private, no-store");
   setResponseHeader("Referrer-Policy","no-referrer");
   const actor=await getCanonicalCommandContext(getRequest());
   if(actor.role!=="teacher"||!actor.actorPersonId||
      actor.scope.siteIds?.length!==1||
      actor.scope.organizationIds?.length!==1)
     throw new AuthorizationError("exact CAN academic teacher membership");
   assertCapability(actor,"teacher:read");
   return db.transaction(async tx=>{
     const [cls]=await tx.select().from(canonicalClasses)
       .where(eq(canonicalClasses.id,data.classId)).limit(1);
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
