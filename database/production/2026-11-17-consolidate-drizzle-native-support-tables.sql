-- Move three existing empty canonical tables into the authoritative public schema.
-- This migration is paired with the pgTable mapping in src/db/canonical-v301:
-- learning.ts and classroom-site-placements.ts.
-- No bridge, copies, Site rekey or duplicate entities. FK targets retain OIDs.
-- Main branch only; fail closed on changed permissions, data or dependencies.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';
DO $preflight$
DECLARE name text; object_id oid; count_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 FOREACH name IN ARRAY ARRAY['content_assets','deployment_organization_roles','enrollment_site_placements'] LOOP
  object_id:=to_regclass('education_v30.'||name);
  IF object_id IS NULL OR to_regclass('public.'||name) IS NOT NULL
  THEN RAISE EXCEPTION 'Source or destination changed: %',name; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=object_id
    AND c.relkind='r' AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity
    AND c.relacl IS NULL)
   OR EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='education_v30'
      AND p.tablename=name)
   OR EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=object_id AND NOT t.tgisinternal)
   OR EXISTS (SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%')
   OR EXISTS (SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
  THEN RAISE EXCEPTION 'Security or dependent executable changed: %',name; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO count_rows;
  IF count_rows<>0 THEN RAISE EXCEPTION 'Table has new live data: %',name; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.content_assets SET SCHEMA public;
ALTER TABLE education_v30.deployment_organization_roles SET SCHEMA public;
ALTER TABLE education_v30.enrollment_site_placements SET SCHEMA public;
DO $verify$
DECLARE name text; count_rows bigint;
BEGIN
 FOREACH name IN ARRAY ARRAY['content_assets','deployment_organization_roles','enrollment_site_placements'] LOOP
  IF to_regclass('education_v30.'||name) IS NOT NULL OR to_regclass('public.'||name) IS NULL
  THEN RAISE EXCEPTION 'Table was not moved: %',name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',name) INTO count_rows;
  IF count_rows<>0 THEN RAISE EXCEPTION 'Unexpected rows after moving %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;
