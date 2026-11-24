-- Synthetic Valor recovery only. No source ownership claim, approved media,
-- fabricated checksum, presenter appointment, delivery policy or publication.
-- The existing fixture creator is provenance, not an independent reviewer.
CREATE OR REPLACE VIEW public.valor_instructional_reference_candidates WITH (security_invoker=true) AS
SELECT DISTINCT c.course_version_id,cv.course_id,co.publisher_organization_id,
 c.created_by_person_id,l.id lesson_id,item->>'url' source_url,
 item->>'title' source_title
FROM public.classes c JOIN public.sites s ON s.id=c.site_id
JOIN public.course_versions cv ON cv.id=c.course_version_id
JOIN public.courses co ON co.id=cv.course_id
JOIN public.course_lessons l ON l.course_version_id=cv.id
JOIN public.people p ON p.id=c.created_by_person_id
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(l.content->'resources')='array' THEN l.content->'resources' ELSE '[]'::jsonb END) item
WHERE s.id='f1000000-0000-4000-8000-000000000003'::uuid
 AND s.metadata @> '{"synthetic":true}'::jsonb AND cv.syllabus->>'synthetic'='true'
 AND p.active AND p.metadata @> '{"synthetic":true}'::jsonb
 AND co.publisher_organization_id=c.operating_organization_id
 AND item->>'url' ~ '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$'
 AND nullif(btrim(item->>'title'),'') IS NOT NULL;
REVOKE ALL ON public.valor_instructional_reference_candidates FROM PUBLIC;
INSERT INTO public.content_assets(id,owner_organization_id,title,kind,external_url)
SELECT md5('valor-reference-asset:'||publisher_organization_id||':'||source_url)::uuid,
 publisher_organization_id,min(source_title),'video',source_url
FROM public.valor_instructional_reference_candidates GROUP BY publisher_organization_id,source_url
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.content_asset_versions(id,asset_id,version_no,license_terms,lifecycle)
SELECT DISTINCT md5('valor-reference-version:'||publisher_organization_id||':'||source_url)::uuid,
 md5('valor-reference-asset:'||publisher_organization_id||':'||source_url)::uuid,1,
 '{"provenance":"valor_fixture_reference_recovery","rightsStatus":"unverified","mediaBytesVerified":false,"publicationApproved":false}'::jsonb,'draft'
FROM public.valor_instructional_reference_candidates
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.instructional_tracks(id,course_id,producer_organization_id,title)
SELECT DISTINCT md5('valor-reference-track:'||course_version_id)::uuid,course_id,publisher_organization_id,
 'Recovered supplemental references (review required)'
FROM public.valor_instructional_reference_candidates
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.instructional_track_versions(id,instructional_track_id,course_version_id,course_id,created_by_person_id,version_no,lifecycle,track_kind)
SELECT DISTINCT md5('valor-reference-track-version:'||course_version_id)::uuid,
 md5('valor-reference-track:'||course_version_id)::uuid,course_version_id,course_id,created_by_person_id,1,'draft','supplemental'
FROM public.valor_instructional_reference_candidates
ON CONFLICT(id) DO NOTHING;
WITH candidates AS (
 SELECT *,row_number() OVER(PARTITION BY course_version_id,lesson_id ORDER BY source_url)::int ordinal
 FROM public.valor_instructional_reference_candidates
)
INSERT INTO public.track_lesson_presentations(id,track_version_id,course_version_id,course_lesson_id,asset_version_id,presentation_kind,ordinal,accessibility_notes)
SELECT md5('valor-reference-presentation:'||lesson_id||':'||source_url)::uuid,
 md5('valor-reference-track-version:'||course_version_id)::uuid,course_version_id,lesson_id,
 md5('valor-reference-version:'||publisher_organization_id||':'||source_url)::uuid,
 'supplement',ordinal,'{"reviewRequired":true,"captionsVerified":false,"provenance":"original_lesson_reference"}'::jsonb
FROM candidates
WHERE NOT EXISTS (SELECT 1 FROM public.track_lesson_presentations t WHERE t.id=md5('valor-reference-presentation:'||lesson_id||':'||source_url)::uuid)
 AND EXISTS(SELECT 1 FROM public.instructional_track_versions v WHERE v.id=md5('valor-reference-track-version:'||course_version_id)::uuid AND v.lifecycle='draft' AND v.submission_manifest_hash IS NULL)
ON CONFLICT(id) DO NOTHING;
