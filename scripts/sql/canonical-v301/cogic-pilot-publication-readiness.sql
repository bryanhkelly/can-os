-- Read-only inspection: draft learning products for the reusable training pilots.
-- A published Solution recipe is not a published Course, Offering or registration release.
-- Does not change partner-owned content, approve media or grant release authority.
WITH pilots AS (
 SELECT o.code AS offering_code, ov.lifecycle AS offering_status,
        cv.lifecycle AS course_status, t.state AS training_status,
        av.lifecycle AS assessment_status,
        (t.approved_by_person_id IS NOT NULL) AS training_approved,
        COUNT(DISTINCT cl.id) AS lesson_count,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.content->>'placeholder' = 'true') AS placeholder_lessons,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.content->>'requiresPartnerContentApproval' = 'true'
                                         OR cl.content->>'requiresIndependentReview' = 'true') AS lesson_reviews_required,
        COUNT(DISTINCT cl.id) FILTER (WHERE cl.content->>'assessmentStatus' = 'not_published') AS lesson_assessments_pending
 FROM public.offerings o
 JOIN public.offering_versions ov ON ov.offering_id = o.id
 JOIN public.noncredit_training_versions t ON t.offering_version_id = ov.id
 JOIN public.offering_courses oc ON oc.offering_version_id = ov.id
 JOIN public.course_versions cv ON cv.id = oc.course_version_id
 JOIN public.assessment_versions av ON av.id = t.assessment_version_id
 LEFT JOIN public.course_lessons cl ON cl.course_version_id = cv.id
 WHERE o.code IN ('CLC-CUSTOM-TRAINING-01','CLC-DIGITAL-01')
 GROUP BY o.code, ov.lifecycle, cv.lifecycle, t.state, av.lifecycle, t.approved_by_person_id
)
SELECT * FROM pilots ORDER BY offering_code;
