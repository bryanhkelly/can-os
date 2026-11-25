-- Independent assertions run after the exact journal replay.
DO $accept$
DECLARE obj text; role_name text; privilege_name text;
BEGIN
 FOREACH obj IN ARRAY ARRAY['academic_enrollment_cutover_links','graded_submission_revisions','historical_academic_evidence','historical_academic_evidence_candidates','valor_instructional_reference_candidates'] LOOP
  IF to_regclass('public.'||obj) IS NULL THEN RAISE EXCEPTION 'Missing %',obj; END IF;
  FOREACH role_name IN ARRAY ARRAY['anonymous','authenticated'] LOOP
   FOREACH privilege_name IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] LOOP
    IF has_table_privilege(role_name,'public.'||obj,privilege_name) THEN
     RAISE EXCEPTION 'Unexpected % access to %',role_name,obj;
    END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled<>'D' AND
  ((tgrelid='public.graded_submissions'::regclass AND tgname='graded_submission_capture_revision')
   OR (tgrelid='public.graded_submission_revisions'::regclass AND tgname='graded_submission_revision_immutable')
   OR (tgrelid='public.historical_academic_evidence'::regclass AND tgname='historical_academic_evidence_guard')))<>3 THEN
  RAISE EXCEPTION 'Academic provenance triggers missing';
 END IF;
 IF EXISTS (SELECT 1 FROM public.graded_submissions s WHERE NOT EXISTS
  (SELECT 1 FROM public.graded_submission_revisions r WHERE r.submission_id=s.id)) THEN
  RAISE EXCEPTION 'Missing observed revision baseline';
 END IF;
END $accept$;
