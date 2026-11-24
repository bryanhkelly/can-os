import {sql} from "drizzle-orm";
import type {db} from "@/db/client";
import {projectHistoricalAcademicPage} from "@/domain/historical-academic-evidence";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Call only after role-specific Class authorization. Recheck current source,
 * exact Person/placement and published status; never disclose raw snapshots. */
export async function readHistoricalClassWork(tx:Tx,scope:{classId:string;classEnrollmentId:string|null;beforeId?:string}){
 const result=await tx.execute(sql`
  SELECT h.id,h.record_kind,h.source_record,
    a.title AS assignment_title,a.points_possible,
    CASE WHEN ${scope.classEnrollmentId}::uuid IS NULL THEN coalesce(p.preferred_name,concat_ws(' ',p.legal_first_name,p.legal_last_name)) ELSE NULL END AS learner_name
  FROM public.historical_academic_evidence h
  JOIN public.historical_academic_evidence_candidates candidate
    ON candidate.record_kind=h.record_kind AND candidate.source_record_id=h.source_record_id
    AND candidate.source_sha256=h.source_sha256 AND candidate.class_id=h.class_id
    AND candidate.class_enrollment_id IS NOT DISTINCT FROM h.class_enrollment_id
  JOIN public.class_enrollments ce ON ce.id=h.class_enrollment_id AND ce.class_id=h.class_id AND ce.status='active'
  JOIN public.academic_enrollment_cutover_links link ON link.class_enrollment_id=ce.id
  JOIN public.enrollments e ON e.id=link.legacy_enrollment_id AND e.kind='section' AND e.status='active'
  JOIN public.people p ON p.id=ce.learner_person_id AND p.active
  LEFT JOIN public.submissions sub ON h.record_kind='submission' AND sub.id=h.source_record_id
  LEFT JOIN public.assessments a ON a.id=sub.assessment_id AND a.section_id=e.section_id
  LEFT JOIN public.section_grades g ON h.record_kind='section_grade' AND g.id=h.source_record_id
     AND g.section_id=e.section_id AND g.student_profile_id=e.student_profile_id
  WHERE h.class_id=${scope.classId}::uuid
    AND (${scope.classEnrollmentId}::uuid IS NULL OR ce.id=${scope.classEnrollmentId}::uuid)
    AND ( (h.record_kind='submission' AND a.status='published' AND sub.student_profile_id=e.student_profile_id
        AND sub.status IN ('submitted','returned','graded'))
       OR (h.record_kind='section_grade' AND ${scope.classEnrollmentId}::uuid IS NOT NULL AND g.status='finalized'))
    AND (${scope.beforeId??null}::uuid IS NULL OR h.id<${scope.beforeId??null}::uuid)
  ORDER BY h.id DESC LIMIT 21
 `);
 return projectHistoricalAcademicPage(result.rows);
}
