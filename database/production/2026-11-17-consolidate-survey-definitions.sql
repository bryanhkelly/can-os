-- CAN OS production main schema cutover: empty native survey definitions.
-- Keep OID, RLS, existing FK to survey_versions. No copy or bridge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE obj oid;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Wrong Neon target'; END IF;
 obj:=to_regclass('education_v30.survey_definitions');
 IF obj IS DISTINCT FROM 411924::oid OR to_regclass('public.survey_definitions') IS NOT NULL
 THEN RAISE EXCEPTION 'Unexpected source or destination'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=obj AND relkind='r' AND relrowsecurity AND relforcerowsecurity AND relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=obj AND contype='f')<>1
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=obj AND NOT tgisinternal)
 OR EXISTS(SELECT 1 FROM pg_proc WHERE prosrc ILIKE '%survey_definitions%')
 OR EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%survey_definitions%')
 OR (SELECT count(*) FROM education_v30.survey_definitions)<>0
 THEN RAISE EXCEPTION 'Schema, security, or source data changed'; END IF;
END $preflight$;
ALTER TABLE education_v30.survey_definitions SET SCHEMA public;
DO $verify$
DECLARE obj oid;
BEGIN
 obj:=to_regclass('public.survey_definitions');
 IF obj IS DISTINCT FROM 411924::oid OR to_regclass('education_v30.survey_definitions') IS NOT NULL
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=obj AND relrowsecurity AND relforcerowsecurity)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=obj)<>1
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=obj AND contype='f')<>1
 OR (SELECT count(*) FROM public.survey_definitions)<>0
 THEN RAISE EXCEPTION 'Survey definition relocation failed'; END IF;
END $verify$;
COMMIT;
