-- Retirement of one UNUSED zero-row v3.0 legacy leaf, not a schema move.
-- Review 2026-11-18: zero records, zero incoming non-self FKs, no current
-- application/Drizzle consumer, view or SQL routine references, and the
-- validation trigger function has no other trigger consumers.
-- Removing this unused case-closure prototype does NOT retire active
-- assurance_case_findings / assurance_cases or their evidence relations.
-- No CASCADE, no blanket removal, no data copying.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE source_oid oid; checker_oid oid;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing any database other than CAN OS Neon main'; END IF;
 source_oid:=to_regclass('education_v30.assurance_case_outcomes');
 checker_oid:=to_regprocedure('education_v30.v27_validate_case_outcome()');
 IF source_oid IS DISTINCT FROM 412726::oid
    OR checker_oid IS DISTINCT FROM 413611::oid
    OR to_regclass('public.assurance_case_outcomes') IS NOT NULL
 THEN RAISE EXCEPTION 'Unexpected legacy relation/function identity or public collision'; END IF;
 IF (SELECT count(*) FROM education_v30.assurance_case_outcomes)<>0
 OR (SELECT count(*) FROM pg_constraint fk
     WHERE fk.contype='f' AND fk.confrelid=source_oid AND fk.conrelid<>source_oid)<>0
 OR (SELECT count(*) FROM pg_trigger t
     WHERE t.tgfoid=checker_oid AND NOT t.tgisinternal)<>1
 OR NOT EXISTS (SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid=source_oid AND t.tgfoid=checker_oid
       AND t.tgname='case_outcome_completion_gate' AND t.tgenabled<>'D')
 OR (SELECT count(*) FROM pg_trigger t
     WHERE t.tgrelid=source_oid AND NOT t.tgisinternal)<>2
 OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%assurance_case_outcomes%')
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prosrc ILIKE '%assurance_case_outcomes%')
 OR NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=source_oid
     AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'Zero-row unused leaf/dependency guard failed'; END IF;
END $preflight$;
DROP TABLE education_v30.assurance_case_outcomes RESTRICT;
-- This trigger-only routine has no other trigger consumer. Drop it separately.
DROP FUNCTION education_v30.v27_validate_case_outcome() RESTRICT;
DO $postflight$
BEGIN
 IF to_regclass('education_v30.assurance_case_outcomes') IS NOT NULL
    OR to_regprocedure('education_v30.v27_validate_case_outcome()') IS NOT NULL
    OR to_regclass('education_v30.assurance_cases') IS NULL
    OR to_regclass('public.assurance_case_findings') IS NULL
 THEN RAISE EXCEPTION 'Legacy leaf retirement failed or retained authority was affected'; END IF;
END $postflight$;
COMMIT;
