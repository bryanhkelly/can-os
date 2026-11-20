-- CAN OS pilot lesson video references, reviewed as candidate supplements.
-- Idempotent and non-publishing: partner/teacher approval remains mandatory.
-- These canonical course_versions are draft. Do not mark the course published.
WITH matches(lesson_key,video_id,video_title,publisher) AS (
 VALUES
 ('ask-better-questions','dD-co5nPhQE','Free AI Course for Beginners: Prompts','Raj Photo Editing and Much More'),
 ('verify-before-you-trust','4S5rnN3meFw','AI Hallucinations: Fact-Check AI Before You Hit Submit','Micah Bustos · Texas State University project'),
 ('protect-your-digital-identity','sg0kQYvTlnc','How to Avoid Phishing! (We Can Secure Our World)','CISA'),
 ('responsible-ai-project','6JfZoaeVwxY','Safeguarding Tomorrow’s Data Landscape: AI Ethics & Privacy Workshop','Ajay Shrestha · Privacy-Aware AI Research Team')
)
UPDATE public.course_lessons AS lesson
SET content=jsonb_set(
  jsonb_set(lesson.content,'{videoResources}',
    coalesce(lesson.content->'videoResources','[]'::jsonb) ||
    jsonb_build_array(jsonb_build_object(
      'provider','youtube',
      'url','https://www.youtube.com/watch?v='||matches.video_id,
      'videoId',matches.video_id,
      'title',matches.video_title,
      'publisher',matches.publisher,
      'placement','supplemental',
      'reviewStatus','teacher_review_required',
      'verifiedBy','youtube_search_2026_11_19'
    )),true),
  '{mediaStatus}','"linked_for_review"'::jsonb,true)
FROM matches
WHERE lesson.lesson_key=matches.lesson_key
  AND lesson.course_version_id IN (
    SELECT version.id FROM public.course_versions version
    JOIN public.courses course ON course.id=version.course_id
    WHERE course.title='AI and Digital Skills' AND version.lifecycle='draft'
  )
  AND NOT coalesce(lesson.content->'videoResources','[]'::jsonb)
    @> jsonb_build_array(jsonb_build_object('videoId',matches.video_id));
