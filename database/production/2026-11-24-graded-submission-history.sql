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
REVOKE ALL ON public.graded_submission_revisions FROM PUBLIC;
DO $policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='graded_submission_revisions' AND policyname='can_v30_trusted_owner_access') THEN
   CREATE POLICY can_v30_trusted_owner_access ON public.graded_submission_revisions
     FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
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
