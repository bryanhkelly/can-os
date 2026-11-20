-- CAN OS: video coverage audit across both curriculum models.
-- This report is read-only. A URL is a candidate, not evidence of embed rights,
-- captions, child suitability, teaching quality or publisher approval.
WITH template_lessons AS (
  SELECT course.code AS course_code,course.title AS course_title,
    version.id AS version_id,version.version AS version_number,
    version.status::text AS lifecycle,
    lesson->>'id' AS lesson_id,lesson->>'title' AS lesson_title,
    coalesce(lesson->'resources','[]'::jsonb) AS resources
  FROM public.course_template_versions version
  JOIN public.course_templates course ON course.id=version.course_template_id
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(version.curriculum->'learning'->'modules','[]'::jsonb)) module
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(module->'lessons','[]'::jsonb)) lesson
), template_summary AS (
 SELECT lifecycle,count(*) AS total_lessons,
   count(*) FILTER (WHERE EXISTS (
     SELECT 1 FROM jsonb_array_elements(resources) resource
     WHERE resource->>'url' ~* '^https://(www[.])?(youtube[.]com/watch|youtu[.]be/|vimeo[.]com/)'
   )) AS lessons_with_direct_video_url
 FROM template_lessons GROUP BY lifecycle
), native_summary AS (
 SELECT version.lifecycle AS lifecycle,count(*) AS total_lessons,
   count(*) FILTER (WHERE jsonb_array_length(coalesce(lesson.content->'videoResources','[]'::jsonb))>0) AS lessons_with_video_candidates
 FROM public.course_lessons lesson
 JOIN public.course_versions version ON lesson.course_version_id=version.id
 GROUP BY version.lifecycle
)
SELECT 'template_versions' AS inventory,lifecycle,total_lessons,
       lessons_with_direct_video_url AS matched_or_candidate,
       total_lessons-lessons_with_direct_video_url AS remaining
FROM template_summary
UNION ALL
SELECT 'native_courses',lifecycle,total_lessons,
       lessons_with_video_candidates,total_lessons-lessons_with_video_candidates
FROM native_summary
ORDER BY inventory,lifecycle;
