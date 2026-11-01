-- Real complete-schema SQL acceptance on disposable PostgreSQL service,
-- not a Neuro/Neon branch and not a substitute for authenticated registrar UI.
DO $schema$
BEGIN
 IF to_regclass('public.graduation_requirement_sets') IS NULL OR
    to_regclass('public.academic_credential_release_authorizations') IS NULL OR
    to_regclass('public.curriculum_interop_mappings') IS NULL
 THEN RAISE EXCEPTION 'Required platform tables absent after complete migration'; END IF;
 IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='graduation_requirement_sets'
     AND column_name IN ('cohort_start','cohort_end','supersedes_requirement_set_id','applicability_reason'))<>4
 THEN RAISE EXCEPTION '0056 cohort columns absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
     AND conname='graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk'
     AND contype='f') THEN RAISE EXCEPTION '0056 real FK missing'; END IF;
 IF (SELECT COUNT(*) FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
     AND conname IN ('graduation_cohort_bounds_ck','graduation_supersession_not_self_ck'))<>2
 THEN RAISE EXCEPTION '0056 CHECK constraints missing'; END IF;
END $schema$;

-- Insert representative legacy approval using ACTUAL organization/person
-- foreign keys, exercise registrar-style classification, and roll everything
-- back before this disposable DB is destroyed.
BEGIN;
INSERT INTO organizations(id,type,name,slug)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','can_network',
        'Disposable CAN Issuer','disposable-graduation-issuer');
INSERT INTO people(id,legal_first_name,legal_last_name)
VALUES ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Test','Registrar');
INSERT INTO graduation_requirement_sets
 (id,issuing_organization_id,academic_year,version,requirements,approved_by_person_id)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        '2025','legacy-unclassified','[{"subject":"Math","minimumUnits":3}]'::jsonb,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
DO $legacy$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM graduation_requirement_sets
    WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      AND cohort_start IS NULL AND cohort_end IS NULL AND applicability_reason IS NULL
      AND requirements='[{"subject":"Math","minimumUnits":3}]'::jsonb)
 THEN RAISE EXCEPTION 'Legacy policy changed or was automatically classified'; END IF;
END $legacy$;
UPDATE graduation_requirement_sets
 SET cohort_start='2023',cohort_end='2025',applicability_reason='Registrar reviewed signed legacy policy'
 WHERE id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
DO $constraints$
DECLARE legacy uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM graduation_requirement_sets WHERE id=legacy
    AND cohort_start='2023' AND cohort_end='2025'
    AND requirements='[{"subject":"Math","minimumUnits":3}]'::jsonb)
 THEN RAISE EXCEPTION 'Attested cohort classification failed or overwrote requirements'; END IF;
 BEGIN
  UPDATE graduation_requirement_sets SET cohort_end=NULL WHERE id=legacy;
  RAISE EXCEPTION 'Partial-NULL cohort accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE graduation_requirement_sets SET cohort_end='2022' WHERE id=legacy;
  RAISE EXCEPTION 'Reverse cohort accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE graduation_requirement_sets SET cohort_start='20X4' WHERE id=legacy;
  RAISE EXCEPTION 'Invalid cohort year accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  UPDATE graduation_requirement_sets SET supersedes_requirement_set_id=legacy WHERE id=legacy;
  RAISE EXCEPTION 'Self-supersession accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $constraints$;
INSERT INTO graduation_requirement_sets
 (id,issuing_organization_id,academic_year,version,requirements,approved_by_person_id,
  cohort_start,cohort_end,supersedes_requirement_set_id,applicability_reason)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'cccccccc-cccc-4ccc-8ccc-cccccccccccc','2025','superseding',
        '[{"subject":"Math","minimumUnits":3}]'::jsonb,
        'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        '2023','2025','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','Registrar reviewed replacement');
DO $supersession$
BEGIN
 BEGIN
  INSERT INTO graduation_requirement_sets
   (issuing_organization_id,academic_year,version,requirements,approved_by_person_id,
    cohort_start,cohort_end,supersedes_requirement_set_id)
  VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','2025','competing',
          '[]'::jsonb,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          '2023','2025','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  RAISE EXCEPTION 'Competing direct supersession accepted';
 EXCEPTION WHEN unique_violation THEN NULL;
 END;
END $supersession$;
ROLLBACK;

DO $rollback$
BEGIN
 IF EXISTS (SELECT 1 FROM graduation_requirement_sets
   WHERE id IN ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
                'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
 THEN RAISE EXCEPTION 'Acceptance fixture was not rolled back'; END IF;
END $rollback$;
SELECT 'full-schema-and-classification-accepted' AS check_status;
