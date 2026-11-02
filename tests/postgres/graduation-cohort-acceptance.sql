-- Executed in the same transaction as the exact production migration SQL.
DO $migration_acceptance$
DECLARE
  existing_id uuid := '00000000-0000-0000-0000-000000000123';
  policy_id uuid := '00000000-0000-0000-0000-000000000124';
  revision_id uuid := '00000000-0000-0000-0000-000000000125';
BEGIN
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema='public' AND table_name='graduation_requirement_sets'
      AND column_name IN ('cohort_start','cohort_end','supersedes_requirement_set_id','applicability_reason')) <> 4
  THEN RAISE EXCEPTION 'Graduation cohort schema fields missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
      AND conname='graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk'::name
      AND contype='f')
  THEN RAISE EXCEPTION 'Original public self-referencing FK not installed'; END IF;
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
      AND conname IN ('graduation_cohort_bounds_ck','graduation_supersession_not_self_ck')) <> 2
  THEN RAISE EXCEPTION 'Graduation CHECK constraints missing'; END IF;
  IF (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='graduation_requirement_sets'
      AND indexname IN ('graduation_requirement_superseded_once_uq','graduation_requirement_cohort_lookup_idx')) <> 2
  THEN RAISE EXCEPTION 'Graduation cohort migration indexes missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM graduation_requirement_sets WHERE id=existing_id
      AND cohort_start IS NULL AND cohort_end IS NULL AND applicability_reason IS NULL)
  THEN RAISE EXCEPTION 'Legacy policy was inappropriately backfilled'; END IF;

  INSERT INTO graduation_requirement_sets (id,issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end)
  VALUES (policy_id,'00000000-0000-0000-0000-000000000010','2026','valid','[]'::jsonb,'00000000-0000-0000-0000-000000000011','2024','2026');
  INSERT INTO graduation_requirement_sets (id,issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end,supersedes_requirement_set_id,applicability_reason)
  VALUES (revision_id,'00000000-0000-0000-0000-000000000010','2026','revision','[]'::jsonb,'00000000-0000-0000-0000-000000000011','2024','2026',policy_id,'Reviewed policy replacement');

  BEGIN
    INSERT INTO graduation_requirement_sets (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end)
    VALUES ('00000000-0000-0000-0000-000000000010','2026','half-null','[]'::jsonb,'00000000-0000-0000-0000-000000000011','2024',NULL);
    RAISE EXCEPTION 'Half-null cohort wrongly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO graduation_requirement_sets (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end)
    VALUES ('00000000-0000-0000-0000-000000000010','2026','reverse-half-null','[]'::jsonb,'00000000-0000-0000-0000-000000000011',NULL,'2025');
    RAISE EXCEPTION 'Reverse half-null cohort wrongly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO graduation_requirement_sets (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end)
    VALUES ('00000000-0000-0000-0000-000000000010','2026','bad-year','[]'::jsonb,'00000000-0000-0000-0000-000000000011','20X4','2026');
    RAISE EXCEPTION 'Invalid cohort year wrongly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO graduation_requirement_sets (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end)
    VALUES ('00000000-0000-0000-0000-000000000010','2026','reversed','[]'::jsonb,'00000000-0000-0000-0000-000000000011','2027','2025');
    RAISE EXCEPTION 'Reversed cohort wrongly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE graduation_requirement_sets SET supersedes_requirement_set_id=revision_id WHERE id=revision_id;
    RAISE EXCEPTION 'Self-supersession wrongly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO graduation_requirement_sets (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,cohort_start,cohort_end,supersedes_requirement_set_id)
    VALUES ('00000000-0000-0000-0000-000000000010','2026','competing','[]'::jsonb,'00000000-0000-0000-0000-000000000011','2024','2026',policy_id);
    RAISE EXCEPTION 'Duplicate direct policy superseder wrongly accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $migration_acceptance$;
SELECT 'original-FK-and-constraints-pass' AS verification;
