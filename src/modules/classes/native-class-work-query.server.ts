import {sql} from "drizzle-orm";

/** Shared work population for teacher dashboard and Class queues.
 * Callers MUST first authorize every Class ID using the current teaching
 * appointment and publication boundary. Never pass client-supplied IDs alone.
 * This relation is read-only and intentionally contains no learner names,
 * response text, grade decisions or answer keys. */
export function nativeClassWorkRows(classIds:readonly string[]){
  if(!classIds.length)throw new Error("Authorized Class IDs required");
  const ids=sql.join(classIds.map(id=>sql`${id}::uuid`),sql`, `);
  return sql`
    SELECT ce.class_id,ce.id AS enrollment_id,ce.learner_person_id,
      ca.id AS attempt_id,a.id AS assignment_id,a.assignment_key,
      coalesce(a.assignment_spec->>'title',o.official_spec->>'title',a.assignment_key) AS title,
      a.due_at,s.id AS submission_id,s.status::text AS submission_status,
      s.submitted_at
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id=ce.class_id
    JOIN public.learner_course_attempts ca
      ON ca.class_enrollment_id=ce.id AND ca.id=ce.course_attempt_id
      AND ca.course_version_id=c.course_version_id
      AND ca.deployment_id=c.deployment_id AND ca.adoption_id=c.adoption_id
      AND ca.offering_version_id=c.offering_version_id
    JOIN public.graded_assignments a ON a.course_version_id=ca.course_version_id
      AND a.section_id IS NULL
    JOIN public.official_course_assignment_versions o
      ON o.id=a.official_assignment_version_id AND o.course_version_id=a.course_version_id
    LEFT JOIN public.graded_submissions s ON s.assignment_id=a.id
      AND s.course_attempt_id=ca.id AND s.course_version_id=ca.course_version_id
    WHERE ce.class_id IN (${ids}) AND ce.status='active'
      AND ca.status='active' AND ca.section_id IS NULL
  `;
}

/** Returned revisions count as missing only after the assignment deadline.
 * Submitted/graded work and assignments without a deadline are excluded. */
export const nativeOverdueWorkPredicate=sql`due_at<now()
  AND (submission_id IS NULL OR submission_status IN ('assigned','returned'))`;
