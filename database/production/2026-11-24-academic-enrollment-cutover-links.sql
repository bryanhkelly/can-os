-- Durable, one-to-one enrollment recovery provenance. Not a grant, placement
-- approval, curriculum equivalence decision or credit authorization.
CREATE TABLE IF NOT EXISTS public.academic_enrollment_cutover_links (
 legacy_enrollment_id uuid PRIMARY KEY REFERENCES public.enrollments(id) ON DELETE RESTRICT,
 class_enrollment_id uuid NOT NULL UNIQUE REFERENCES public.class_enrollments(id) ON DELETE RESTRICT,
 provenance text NOT NULL CHECK (provenance='valor_v61_recovery'),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.academic_enrollment_cutover_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_enrollment_cutover_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.academic_enrollment_cutover_links FROM PUBLIC;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename='academic_enrollment_cutover_links' AND policyname='can_v30_trusted_owner_access') THEN
 CREATE POLICY can_v30_trusted_owner_access ON public.academic_enrollment_cutover_links
 FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
 END IF;
END $policy$;
-- Exact existing deterministic recovery IDs plus Person, Site, Organization,
-- and synthetic curriculum evidence. No automatic mapping outside this fixture.
INSERT INTO public.academic_enrollment_cutover_links(legacy_enrollment_id,class_enrollment_id,provenance)
SELECT e.id,ce.id,'valor_v61_recovery'
FROM public.enrollments e
JOIN public.student_profiles sp ON sp.id=e.student_profile_id
JOIN public.sections sec ON sec.id=e.section_id
JOIN public.class_enrollments ce ON ce.id=md5('valor-v61:classenrollment:'||e.id)::uuid
 AND ce.learner_person_id=sp.person_id
JOIN public.classes c ON c.id=ce.class_id AND c.id=md5('valor-v61:class:'||sec.code)::uuid
 AND c.site_id=sec.site_id AND c.operating_organization_id=e.organization_id
JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
JOIN public.course_versions cv ON cv.id=c.course_version_id
WHERE e.kind='section' AND s.id='f1000000-0000-4000-8000-000000000003'::uuid
 AND s.metadata @> '{"synthetic":true}'::jsonb AND cv.syllabus->>'synthetic'='true'
ON CONFLICT(legacy_enrollment_id) DO NOTHING;
-- Reject inconsistent prior mappings rather than silently accepting them.
DO $verify$
BEGIN
 IF EXISTS (
 SELECT 1 FROM public.academic_enrollment_cutover_links link
 JOIN public.enrollments e ON e.id=link.legacy_enrollment_id
 JOIN public.student_profiles sp ON sp.id=e.student_profile_id
 JOIN public.sections sec ON sec.id=e.section_id
 JOIN public.class_enrollments ce ON ce.id=link.class_enrollment_id
 JOIN public.classes c ON c.id=ce.class_id
 JOIN public.sites s ON s.id=c.site_id
 JOIN public.course_versions cv ON cv.id=c.course_version_id
 WHERE e.kind IS DISTINCT FROM 'section'
 OR ce.id IS DISTINCT FROM md5('valor-v61:classenrollment:'||e.id)::uuid
 OR ce.learner_person_id IS DISTINCT FROM sp.person_id
 OR c.id IS DISTINCT FROM md5('valor-v61:class:'||sec.code)::uuid
 OR c.site_id IS DISTINCT FROM sec.site_id
 OR c.operating_organization_id IS DISTINCT FROM e.organization_id
 OR s.organization_id IS DISTINCT FROM c.operating_organization_id
 OR s.id IS DISTINCT FROM 'f1000000-0000-4000-8000-000000000003'::uuid
 OR NOT (s.metadata @> '{"synthetic":true}'::jsonb)
 OR cv.syllabus->>'synthetic' IS DISTINCT FROM 'true'
 ) THEN RAISE EXCEPTION 'Invalid academic recovery provenance'; END IF;
END $verify$;
