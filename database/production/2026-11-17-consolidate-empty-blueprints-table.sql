-- OID-preserving move of canonical Blueprint definition table.
-- Real Blueprint versions and configurations retain FK references; no copy or bridge.
-- Neon main only; coordinate src/db/canonical-v301/blueprints.ts mapping cutover.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $check$
DECLARE obj oid; n bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Incorrect Neon project/branch'; END IF;
 obj:=to_regclass('education_v30.blueprints');
 IF obj IS DISTINCT FROM 403018::oid OR to_regclass('public.blueprints') IS NOT NULL
 THEN RAISE EXCEPTION 'Blueprint schema identity changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=obj AND relkind='r'
 AND relrowsecurity AND relforcerowsecurity AND relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>2
 OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal)
 OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%blueprints%')
 OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%blueprints%')
 THEN RAISE EXCEPTION 'Unexpected Blueprint security/routine dependencies'; END IF;
 SELECT count(*) INTO n FROM education_v30.blueprints;
 IF n<>0 THEN RAISE EXCEPTION 'Blueprint source table no longer empty'; END IF;
END $check$;
ALTER TABLE education_v30.blueprints SET SCHEMA public;
DO $verify$
DECLARE obj oid;
BEGIN
 obj:=to_regclass('public.blueprints');
 IF obj IS DISTINCT FROM 403018::oid OR to_regclass('education_v30.blueprints') IS NOT NULL
 OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid=obj AND relrowsecurity AND relforcerowsecurity)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>2
 OR (SELECT count(*) FROM public.blueprints)<>0
 OR (SELECT count(*) FROM pg_constraint WHERE contype='f' AND confrelid=obj)<>2
 THEN RAISE EXCEPTION 'Blueprint OID, RLS, row or FK move verification failed'; END IF;
END $verify$;
COMMIT;
