-- 0124: canonical private academic evidence schema and access boundary.
-- Existing production recovery files remain historical records. This migration
-- creates reusable schema only, plus observed current submission baselines
-- where absent. It never executes Valor fixture recovery or publishes content.
-- On existing production relations, retain their owner policies and data.
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
REVOKE ALL ON public.academic_enrollment_cutover_links FROM PUBLIC, anonymous, authenticated;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename='academic_enrollment_cutover_links' AND policyname='can_v30_trusted_owner_access') THEN
 CREATE POLICY can_v30_trusted_owner_access ON public.academic_enrollment_cutover_links
 FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
 END IF;
END $policy$;

--> statement-breakpoint
-- Apply in one transaction as trusted database owner. Baselines are observed
-- current state, not reconstructed historical attempts.
LOCK TABLE public.graded_submissions IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE IF NOT EXISTS public.graded_submission_revisions (
 submission_id uuid NOT NULL,
 course_version_id uuid NOT NULL,
 revision_no integer NOT NULL CHECK (revision_no > 0),
 status text NOT NULL CHECK (status IN ('assigned','submitted','returned','graded')),
 response jsonb NOT NULL,
 submitted_at timestamptz,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 source text NOT NULL CHECK (source IN ('baseline','insert','update')),
 PRIMARY KEY (submission_id,revision_no),
 FOREIGN KEY (submission_id,course_version_id)
   REFERENCES public.graded_submissions(id,course_version_id) ON DELETE RESTRICT
);
ALTER TABLE public.graded_submission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graded_submission_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.graded_submission_revisions FROM PUBLIC, anonymous, authenticated;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='graded_submission_revisions' AND policyname='can_v30_trusted_owner_access') THEN
   CREATE POLICY can_v30_trusted_owner_access ON public.graded_submission_revisions
     FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
 END IF;
END $policy$;
INSERT INTO public.graded_submission_revisions
 (submission_id,course_version_id,revision_no,status,response,submitted_at,source)
SELECT s.id,s.course_version_id,1,s.status,s.response,s.submitted_at,'baseline'
FROM public.graded_submissions s
WHERE NOT EXISTS (SELECT 1 FROM public.graded_submission_revisions r WHERE r.submission_id=s.id)
ON CONFLICT (submission_id,revision_no) DO NOTHING;
CREATE OR REPLACE FUNCTION public.capture_graded_submission_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $capture$
DECLARE next_revision integer;
BEGIN
 IF TG_OP='UPDATE' THEN
   IF (NEW.id,NEW.course_version_id,NEW.course_attempt_id,NEW.assignment_id)
      IS DISTINCT FROM (OLD.id,OLD.course_version_id,OLD.course_attempt_id,OLD.assignment_id) THEN
     RAISE EXCEPTION 'Submission identity is immutable';
   END IF;
   IF (NEW.status,NEW.response,NEW.submitted_at)
      IS NOT DISTINCT FROM (OLD.status,OLD.response,OLD.submitted_at) THEN RETURN NEW; END IF;
 END IF;
 SELECT coalesce(max(revision_no),0)+1 INTO next_revision
 FROM public.graded_submission_revisions WHERE submission_id=NEW.id;
 IF TG_OP='UPDATE' AND next_revision=1 THEN
   RAISE EXCEPTION 'Missing submission history baseline';
 END IF;
 INSERT INTO public.graded_submission_revisions
  (submission_id,course_version_id,revision_no,status,response,submitted_at,source)
 VALUES(NEW.id,NEW.course_version_id,next_revision,NEW.status,NEW.response,NEW.submitted_at,lower(TG_OP));
 RETURN NEW;
END $capture$;
CREATE OR REPLACE FUNCTION public.reject_graded_submission_revision_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $immutable$
BEGIN
 RAISE EXCEPTION 'Submission revision history is append-only';
END $immutable$;
DO $triggers$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.graded_submissions'::regclass AND tgname='graded_submission_capture_revision' AND NOT tgisinternal) THEN
  CREATE TRIGGER graded_submission_capture_revision AFTER INSERT OR UPDATE ON public.graded_submissions
    FOR EACH ROW EXECUTE FUNCTION public.capture_graded_submission_revision();
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.graded_submission_revisions'::regclass AND tgname='graded_submission_revision_immutable' AND NOT tgisinternal) THEN
  CREATE TRIGGER graded_submission_revision_immutable BEFORE UPDATE OR DELETE ON public.graded_submission_revisions
    FOR EACH ROW EXECUTE FUNCTION public.reject_graded_submission_revision_mutation();
 END IF;
END $triggers$;

--> statement-breakpoint
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
REVOKE ALL ON public.historical_academic_evidence FROM PUBLIC, anonymous, authenticated;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename='historical_academic_evidence' AND policyname='can_v30_trusted_owner_access') THEN
 CREATE POLICY can_v30_trusted_owner_access ON public.historical_academic_evidence
 FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
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
REVOKE ALL ON public.historical_academic_evidence_candidates FROM PUBLIC, anonymous, authenticated;

--> statement-breakpoint
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
REVOKE ALL ON public.valor_instructional_reference_candidates FROM PUBLIC, anonymous, authenticated;

--> statement-breakpoint
DO $academic_acl$
DECLARE relation_name text; relation_oid oid; privilege_name text; role_name text;
BEGIN
 FOREACH relation_name IN ARRAY ARRAY['academic_enrollment_cutover_links','graded_submission_revisions','historical_academic_evidence','historical_academic_evidence_candidates','valor_instructional_reference_candidates'] LOOP
  relation_oid := to_regclass('public.' || relation_name);
  IF relation_oid IS NULL THEN RAISE EXCEPTION 'Missing academic relation %', relation_name; END IF;
  IF NOT has_table_privilege(current_user,relation_oid,'SELECT') THEN
   RAISE EXCEPTION 'Trusted owner lost academic access: %',relation_name;
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anonymous','authenticated'] LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege(role_name,relation_oid,privilege_name) THEN
     RAISE EXCEPTION 'Unexpected % privilege for % on %',privilege_name,role_name,relation_name;
    END IF;
   END LOOP;
   IF has_any_column_privilege(role_name,relation_oid,'SELECT,INSERT,UPDATE,REFERENCES') THEN
    RAISE EXCEPTION 'Unexpected column access for % on %',role_name,relation_name;
   END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class p CROSS JOIN LATERAL aclexplode(coalesce(p.relacl,acldefault('r',p.relowner))) a WHERE p.oid=relation_oid AND a.grantee=0) THEN
   RAISE EXCEPTION 'Unexpected PUBLIC privilege on %',relation_name;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class p WHERE p.oid=relation_oid AND
    ((p.relkind='r' AND NOT (p.relrowsecurity AND p.relforcerowsecurity)) OR
     (p.relkind='v' AND NOT coalesce(p.reloptions @> ARRAY['security_invoker=true'],false)))) THEN
   RAISE EXCEPTION 'Academic isolation missing on %',relation_name;
  END IF;
 END LOOP;
END $academic_acl$;
