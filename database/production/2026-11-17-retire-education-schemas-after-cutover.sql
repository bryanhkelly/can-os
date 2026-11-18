-- LAST STEP ONLY. Does not run safely until the complete database, runtime,
-- role, RLS and application cutover has been reviewed and independently validated.
-- Deliberately uses RESTRICT, never CASCADE. Production Neon main only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE old_objects int; old_routines int; old_types int; old_constraints int;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-production-main database'; END IF;
 IF to_regnamespace('education_v30') IS NULL
   OR to_regnamespace('education_v30_secure') IS NULL
 THEN RAISE EXCEPTION 'Unexpected legacy schema state; inspect manually'; END IF;
 SELECT count(*) INTO old_objects FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('education_v30','education_v30_secure');
 SELECT count(*) INTO old_routines FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('education_v30','education_v30_secure');
 SELECT count(*) INTO old_types FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname IN ('education_v30','education_v30_secure');
 SELECT count(*) INTO old_constraints FROM pg_constraint k
 JOIN pg_class source ON source.oid=k.conrelid
 JOIN pg_namespace source_ns ON source_ns.oid=source.relnamespace
 JOIN pg_class target ON target.oid=k.confrelid
 JOIN pg_namespace target_ns ON target_ns.oid=target.relnamespace
 WHERE k.contype='f' AND
 ((source_ns.nspname IN ('education_v30','education_v30_secure') AND target_ns.nspname='public')
 OR (target_ns.nspname IN ('education_v30','education_v30_secure') AND source_ns.nspname='public'));
 IF old_objects<>0 OR old_routines<>0 OR old_types<>0 OR old_constraints<>0
 THEN RAISE EXCEPTION 'Retirement blocked: relations %, routines %, types %, cross-schema FKs %',
   old_objects,old_routines,old_types,old_constraints; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid='public.sites'::regclass
    AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'Shared public.sites RLS/security cutover incomplete'; END IF;
END $guard$;
DROP SCHEMA education_v30_secure RESTRICT;
DROP SCHEMA education_v30 RESTRICT;
COMMIT;
