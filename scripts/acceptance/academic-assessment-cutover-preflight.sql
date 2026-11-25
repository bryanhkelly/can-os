-- Read-only historical assessment cutover preflight. Never authorizes migration.
-- Recovery identifiers describe only the known Valor fixture. No title-only joins.
WITH source_assessments AS (
 SELECT a.id,sec.id section_id,sec.site_id,a.status,
        c.id class_id,c.course_version_id,
        (SELECT count(*) FROM public.graded_assignments ga
          WHERE ga.course_version_id=c.course_version_id AND ga.section_id IS NULL
            AND ga.assignment_spec->>'title'=a.title
            AND ga.assignment_spec->>'instructions'=a.instructions) exact_text_candidates
 FROM public.assessments a JOIN public.sections sec ON sec.id=a.section_id
 LEFT JOIN public.classes c ON c.site_id=sec.site_id
   AND c.id=md5('valor-v61:class:'||sec.code)::uuid
), source_submissions AS (
 SELECT sub.id,sub.assessment_id,sa.site_id,sub.student_profile_id,
        sub.status,sub.score,sub.submitted_at,
        count(*) OVER (PARTITION BY sub.assessment_id,sub.student_profile_id) source_attempt_count,
        sa.exact_text_candidates,
        (SELECT count(*) FROM public.enrollments e
          WHERE e.kind='section' AND e.section_id=sa.section_id AND e.student_profile_id=sp.id) placement_count,
        (SELECT count(*) FROM public.enrollments e
          JOIN public.academic_enrollment_cutover_links link ON link.legacy_enrollment_id=e.id
          JOIN public.class_enrollments ce ON ce.id=link.class_enrollment_id
            AND ce.class_id=sa.class_id AND ce.learner_person_id=sp.person_id
          JOIN public.learner_course_attempts ca ON ca.id=ce.course_attempt_id
            AND ca.class_enrollment_id=ce.id AND ca.course_version_id=sa.course_version_id
            AND ca.status='active'
          WHERE e.kind='section' AND e.section_id=sa.section_id AND e.student_profile_id=sp.id
            AND e.status='active' AND ce.status='active') active_destination_count,
        (SELECT count(*) FROM public.enrollments e
          JOIN public.academic_enrollment_cutover_links link ON link.legacy_enrollment_id=e.id
          JOIN public.class_enrollments ce ON ce.id=link.class_enrollment_id
            AND ce.class_id=sa.class_id AND ce.learner_person_id=sp.person_id
          WHERE e.kind='section' AND e.section_id=sa.section_id AND e.student_profile_id=sp.id
            AND ce.status='pending') pending_destination_count
 FROM public.submissions sub
 JOIN source_assessments sa ON sa.id=sub.assessment_id
 JOIN public.student_profiles sp ON sp.id=sub.student_profile_id
), assessment_inventory AS (
 SELECT site_id,count(*) assessments,count(*) FILTER(WHERE status='published') published,
        count(*) FILTER(WHERE exact_text_candidates=1) one_text_candidate,
        count(*) FILTER(WHERE exact_text_candidates>1) ambiguous_text_candidates,
        count(*) FILTER(WHERE exact_text_candidates=0) no_text_candidate
 FROM source_assessments GROUP BY site_id
), submission_inventory AS (
 SELECT site_id,count(*) submissions,
        count(*) FILTER(WHERE placement_count<>1) ambiguous_or_missing_placement,
        count(*) FILTER(WHERE placement_count=1 AND active_destination_count=1) active_destination,
        count(*) FILTER(WHERE placement_count=1 AND active_destination_count=0 AND pending_destination_count=1) pending_destination,
        count(*) FILTER(WHERE placement_count=1 AND active_destination_count=0 AND pending_destination_count=0) no_active_or_pending_destination,
        count(*) FILTER(WHERE source_attempt_count>1) multi_attempt_records,
        count(*) FILTER(WHERE score IS NOT NULL) scored,
        count(*) FILTER(WHERE status IN ('graded','returned') AND submitted_at IS NULL) missing_historical_submission_timestamp,
        count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.submission_annotations an WHERE an.submission_id=source_submissions.id)) annotated,
        count(*) FILTER(WHERE placement_count=1 AND active_destination_count=1 AND exact_text_candidates=1 AND source_attempt_count=1) potential_candidate_not_approved
 FROM source_submissions GROUP BY site_id
)
SELECT a.site_id,s.name AS site_name,
 a.assessments,a.published,a.one_text_candidate,a.ambiguous_text_candidates,a.no_text_candidate,
 coalesce(b.submissions,0) submissions,coalesce(b.ambiguous_or_missing_placement,0) ambiguous_or_missing_placement,
 coalesce(b.active_destination,0) active_destination,coalesce(b.pending_destination,0) pending_destination,
 coalesce(b.no_active_or_pending_destination,0) no_active_or_pending_destination,
 coalesce(b.multi_attempt_records,0) multi_attempt_records,coalesce(b.scored,0) scored,
 coalesce(b.missing_historical_submission_timestamp,0) missing_historical_submission_timestamp,
 coalesce(b.annotated,0) annotated,coalesce(b.potential_candidate_not_approved,0) potential_candidate_not_approved
FROM assessment_inventory a JOIN public.sites s ON s.id=a.site_id
LEFT JOIN submission_inventory b ON b.site_id=a.site_id ORDER BY s.name,s.id;
