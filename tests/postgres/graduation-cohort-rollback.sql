-- Must run AFTER ROLLBACK of the real migration and acceptance assertions.
DO $rollback_check$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='graduation_requirement_sets'
      AND column_name IN ('cohort_start','cohort_end','supersedes_requirement_set_id','applicability_reason'))
  THEN RAISE EXCEPTION 'Rollback left graduation cohort columns'; END IF;
  IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname IN ('graduation_requirement_superseded_once_uq','graduation_requirement_cohort_lookup_idx'))
  THEN RAISE EXCEPTION 'Rollback left graduation cohort indexes'; END IF;
  IF (SELECT count(*) FROM public.graduation_requirement_sets) <> 1
  THEN RAISE EXCEPTION 'Rollback did not restore the legacy policy fixture'; END IF;
END $rollback_check$;
SELECT 'transactional-rollback-pass' AS verification;
