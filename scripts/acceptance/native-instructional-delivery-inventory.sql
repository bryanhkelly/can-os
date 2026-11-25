-- Read-only instructional delivery inventory. A URL is not an approved asset.
WITH lesson_inventory AS (
 SELECT c.id class_id,c.site_id,c.title,c.course_version_id,l.id lesson_id,
  coalesce(nullif(btrim(l.content->>'body'),''),'')<>'' has_body,
  l.content
 FROM public.classes c LEFT JOIN public.course_lessons l ON l.course_version_id=c.course_version_id
), video_refs AS (
 SELECT li.class_id,li.lesson_id,src.kind,
   item->>'url' url,item->>'reviewStatus' review_status,item->>'title' title
 FROM lesson_inventory li
 CROSS JOIN LATERAL (VALUES ('resources',li.content->'resources'),('videoResources',li.content->'videoResources')) src(kind,entries)
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(src.entries)='array' THEN src.entries ELSE '[]'::jsonb END) item
 WHERE item->>'url' ~* '^https://(www\.)?(youtube\.com/watch\?|youtube\.com/shorts/|youtu\.be/|vimeo\.com/)'
), catalog AS (
 SELECT li.class_id,li.site_id,li.title,li.course_version_id,count(li.lesson_id) lessons,
 count(li.lesson_id) FILTER(WHERE li.has_body) lessons_with_body
 FROM lesson_inventory li GROUP BY li.class_id,li.site_id,li.title,li.course_version_id
)
SELECT c.*, (SELECT count(*) FROM video_refs r WHERE r.class_id=c.class_id) video_references,
 (SELECT count(DISTINCT r.lesson_id) FROM video_refs r WHERE r.class_id=c.class_id) lessons_with_video_references,
 (SELECT count(*) FROM video_refs r WHERE r.class_id=c.class_id AND r.kind='videoResources') supplemental_candidates,
 (SELECT count(*) FROM video_refs r WHERE r.class_id=c.class_id AND r.review_status IS NULL) unclassified_references,
 (SELECT count(*) FROM public.instructional_track_versions v WHERE v.course_version_id=c.course_version_id AND v.lifecycle='published') published_tracks,
 (SELECT count(*) FROM public.track_lesson_presentations t WHERE t.course_version_id=c.course_version_id) presentation_records,
 (SELECT count(*) FROM public.instructional_track_policy_versions p JOIN public.classes cls ON cls.id=c.class_id
   WHERE p.course_version_id=c.course_version_id AND p.deployment_id=cls.deployment_id AND p.adoption_id=cls.adoption_id
     AND p.offering_version_id=cls.offering_version_id AND p.lifecycle='published' AND p.delivery_enabled
     AND p.effective_from<=now() AND (p.effective_through IS NULL OR p.effective_through>now())
     AND NOT EXISTS(SELECT 1 FROM public.instructional_track_policy_withdrawals w WHERE w.policy_version_id=p.id AND w.effective_at<=now())) effective_delivery_policies
FROM catalog c ORDER BY c.title,c.class_id;
