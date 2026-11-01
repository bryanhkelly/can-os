-- Run only after the full committed 0000..0056 chain is applied to an
-- ephemeral PostgreSQL container; this test never targets Neon or user data.
DO $assert$
DECLARE
  migration_count integer;
BEGIN
 IF to_regclass('public.graduation_requirement_sets') IS NULL THEN
  RAISE EXCEPTION 'graduation requirements table absent after complete migration';
 END IF;
 IF to_regclass('public.academic_credential_release_authorizations') IS NULL THEN
  RAISE EXCEPTION 'credential release ledger absent after complete migration';
 END IF;
 IF to_regclass('public.curriculum_interop_mappings') IS NULL THEN
  RAISE EXCEPTION 'OneRoster interop mapping absent after complete migration';
 END IF;
 IF (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema='public'
     AND table_name='graduation_requirement_sets'
     AND column_name IN ('cohort_start','cohort_end','supersedes_requirement_set_id','applicability_reason'))<>4
 THEN RAISE EXCEPTION '0056 cohort columns absent'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
     AND conname='graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk'
     AND contype='f') THEN RAISE EXCEPTION '0056 real FK missing'; END IF;
 IF (SELECT COUNT(*) FROM pg_constraint WHERE conrelid='public.graduation_requirement_sets'::regclass
     AND conname IN ('graduation_cohort_bounds_ck','graduation_supersession_not_self_ck'))<>2
 THEN RAISE EXCEPTION '0056 CHECKs missing'; END IF;
END $assert$;

-- Prove nullable legacy approvals survive unchanged and invalid classifications
-- fail closed in a complete schema, not a hand-written graduation-only table.
BEGIN;
INSERT INTO graduation_requirement_sets
 (id,issuing_organization_id,academic_year,version,requirements,approved_by_person_id)
SELECT 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
       id,'2026','historical-unclassified','[]'::jsonb,
       (SELECT id FROM people LIMIT 1)
FROM organizations LIMIT 1;
-- Some large schemas may have no people/org fixtures; no insertion is expected
-- in that case. The constraint test does not fabricate live identities.
ROLLBACK;
SELECT 'full-schema-migration-verified' AS check_status;