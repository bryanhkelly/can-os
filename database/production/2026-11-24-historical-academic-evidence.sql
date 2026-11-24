-- Preserve exact mapped legacy evidence, not live assignments or grades.
-- Apply as trusted database owner in one transaction. Original rows stay intact.
CREATE TABLE IF NOT EXISTS public.historical_academic_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 record_kind text NOT NULL CHECK (record_kind IN ('assessment','submission','section_grade')),
 source_record_id uuid NOT NULL,
 class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
 class_enrollment_id uuid REFERENCES public.class_enrollments(id) ON DELETE RESTRICT,
 source_record jsonb NOT NULL,
 source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
 captured_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((record_kind='assessment') = (class_enrollment_id IS NULL)),
 CHECK (source_record->>'id'=source_record_id::text),
 UNIQUE(record_kind,source_record_id,source_sha256)
);
ALTER TABLE public.historical_academic_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_academic_evidence FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.historical_academic_evidence FROM PUBLIC;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename='historical_academic_evidence' AND policyname='can_v30_trusted_owner_access') THEN
 CREATE POLICY can_v30_trusted_owner_access ON public.historical_academic_evidence
 FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
 END IF;
END $policy$;
CREATE INDEX IF NOT EXISTS historical_academic_evidence_class_idx
 ON public.historical_academic_evidence(class_id,record_kind,source_record_id,captured_at DESC);
CREATE INDEX IF NOT EXISTS historical_academic_evidence_enrollment_idx
 ON public.historical_academic_evidence(class_enrollment_id,record_kind,source_record_id,captured_at DESC);
CREATE OR REPLACE FUNCTION public.guard_historical_academic_evidence()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $guard$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Historical academic evidence is append-only'; END IF;
 IF NEW.source_sha256 IS DISTINCT FROM encode(sha256(convert_to(NEW.source_record::text,'UTF8')),'hex') THEN
   RAISE EXCEPTION 'Historical academic evidence checksum mismatch';
 END IF;
 IF NEW.class_enrollment_id IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM public.class_enrollments ce WHERE ce.id=NEW.class_enrollment_id AND ce.class_id=NEW.class_id
 ) THEN RAISE EXCEPTION 'Historical academic evidence Class scope mismatch'; END IF;
 RETURN NEW;
END $guard$;
DO $trigger$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.historical_academic_evidence'::regclass AND tgname='historical_academic_evidence_guard' AND NOT tgisinternal) THEN
 CREATE TRIGGER historical_academic_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.historical_academic_evidence
 FOR EACH ROW EXECUTE FUNCTION public.guard_historical_academic_evidence();
 END IF;
END $trigger$;
-- Reusable restricted source projection. Only exact current scope matches.
CREATE OR REPLACE VIEW public.historical_academic_evidence_candidates WITH (security_invoker=true) AS
WITH placements AS (
 SELECT e.id legacy_enrollment_id,e.section_id,e.student_profile_id,ce.id class_enrollment_id,c.id class_id
 FROM public.academic_enrollment_cutover_links link
 JOIN public.enrollments e ON e.id=link.legacy_enrollment_id
 JOIN public.student_profiles sp ON sp.id=e.student_profile_id
 JOIN public.sections sec ON sec.id=e.section_id
 JOIN public.class_enrollments ce ON ce.id=link.class_enrollment_id AND ce.learner_person_id=sp.person_id
 JOIN public.classes c ON c.id=ce.class_id AND c.site_id=sec.site_id AND c.operating_organization_id=e.organization_id
 JOIN public.sites site ON site.id=c.site_id AND site.organization_id=c.operating_organization_id
 WHERE e.kind='section'
), sections AS (
 SELECT section_id,(array_agg(DISTINCT class_id))[1] class_id
 FROM placements GROUP BY section_id HAVING count(DISTINCT class_id)=1
), learners AS (
 SELECT section_id,student_profile_id,(array_agg(DISTINCT class_enrollment_id))[1] class_enrollment_id,
   (array_agg(DISTINCT class_id))[1] class_id
 FROM placements GROUP BY section_id,student_profile_id
 HAVING count(DISTINCT class_enrollment_id)=1 AND count(DISTINCT class_id)=1
), records AS (
 SELECT 'assessment'::text record_kind,a.id source_record_id,s.class_id,NULL::uuid class_enrollment_id,to_jsonb(a) source_record
 FROM public.assessments a JOIN sections s ON s.section_id=a.section_id
 UNION ALL SELECT 'submission',sub.id,l.class_id,l.class_enrollment_id,to_jsonb(sub)
 FROM public.submissions sub JOIN public.assessments a ON a.id=sub.assessment_id
 JOIN learners l ON l.section_id=a.section_id AND l.student_profile_id=sub.student_profile_id
 JOIN sections s ON s.section_id=a.section_id AND s.class_id=l.class_id
 UNION ALL SELECT 'section_grade',g.id,l.class_id,l.class_enrollment_id,to_jsonb(g)
 FROM public.section_grades g JOIN learners l ON l.section_id=g.section_id AND l.student_profile_id=g.student_profile_id
)
SELECT *,encode(sha256(convert_to(source_record::text,'UTF8')),'hex') source_sha256 FROM records;
REVOKE ALL ON public.historical_academic_evidence_candidates FROM PUBLIC;
-- Preserve the exact snapshot once. No invented timestamps, grades, approvals or assignments.
INSERT INTO public.historical_academic_evidence(record_kind,source_record_id,class_id,class_enrollment_id,source_record,source_sha256)
SELECT record_kind,source_record_id,class_id,class_enrollment_id,source_record,source_sha256
FROM public.historical_academic_evidence_candidates
ON CONFLICT(record_kind,source_record_id,source_sha256) DO NOTHING;
DO $verify$
BEGIN
 IF EXISTS (
 SELECT 1 FROM public.historical_academic_evidence_candidates c
 WHERE NOT EXISTS (
 SELECT 1 FROM public.historical_academic_evidence h
 WHERE h.record_kind=c.record_kind AND h.source_record_id=c.source_record_id
 AND h.source_sha256=c.source_sha256 AND h.class_id=c.class_id
 AND h.class_enrollment_id IS NOT DISTINCT FROM c.class_enrollment_id AND h.source_record=c.source_record
 )) THEN RAISE EXCEPTION 'Historical academic evidence preservation incomplete or scope changed'; END IF;
END $verify$;
