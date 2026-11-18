-- Safely move an empty, isolated legacy survey record to public on Neon main.
-- No duplicate/copy, preserves table OID, FKs, grants and FORCE RLS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE obj oid; rows_count bigint; r record;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing any branch other than Neon main'; END IF;
 obj:=to_regclass('education_v30.survey_confidential_redemptions');
 IF obj IS NULL OR to_regclass('public.survey_confidential_redemptions') IS NOT NULL
 THEN RAISE EXCEPTION 'Source/destination changed'; END IF;
 SELECT relkind,relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=obj;
 IF r.relkind<>'r' OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity
 OR r.relacl IS NOT NULL OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>1
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%survey_confidential_redemptions%')
 OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%survey_confidential_redemptions%')
 THEN RAISE EXCEPTION 'Unsafe table changes or references'; END IF;
 SELECT count(*) INTO rows_count FROM education_v30.survey_confidential_redemptions;
 IF rows_count<>0 THEN RAISE EXCEPTION 'Source no longer empty: %',rows_count; END IF;
END $preflight$;
ALTER TABLE education_v30.survey_confidential_redemptions SET SCHEMA public;
DO $postflight$
DECLARE obj oid; r record; rows_count bigint;
BEGIN
 obj:=to_regclass('public.survey_confidential_redemptions');
 IF obj IS NULL OR to_regclass('education_v30.survey_confidential_redemptions') IS NOT NULL
 THEN RAISE EXCEPTION 'Move incomplete'; END IF;
 SELECT relrowsecurity,relforcerowsecurity,relacl INTO r FROM pg_class WHERE oid=obj;
 SELECT count(*) INTO rows_count FROM public.survey_confidential_redemptions;
 IF rows_count<>0 OR NOT r.relrowsecurity OR NOT r.relforcerowsecurity
  OR r.relacl IS NOT NULL OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>1
 THEN RAISE EXCEPTION 'Post-move data or security mismatch'; END IF;
END $postflight$;
COMMIT;
