-- CAN OS Neon main: relocate two empty native entities into the one
-- authoritative public application schema, preserving table OIDs and all
-- cross-schema composite/person/authorization relationships as they exist.
-- Verified: no Drizzle runtime declaration, SQL routine/view usage, user
-- trigger, row-security policy, custom grant, or destination name collision.
-- This migration does not create a shadow Site/Person or enrollment record.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='40s';
DO $guard$
DECLARE name text; obj oid; rows_before bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 FOREACH name IN ARRAY ARRAY['course_sections','foundations'] LOOP
   obj:=to_regclass('education_v30.'||name);
   IF obj IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Source/destination changed for %',name; END IF;
   IF NOT EXISTS (SELECT 1 FROM pg_class c
     WHERE c.oid=obj AND c.relkind='r' AND NOT c.relrowsecurity
      AND NOT c.relforcerowsecurity AND c.relacl IS NULL)
    OR EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='education_v30'
      AND p.tablename=name)
    OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p')
      AND p.prosrc ILIKE '%'||name||'%')
    OR EXISTS(SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%')
   THEN RAISE EXCEPTION 'Security or executable dependency changed for %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO rows_before;
   IF rows_before<>0 THEN RAISE EXCEPTION 'Unexpected live rows in %',name; END IF;
 END LOOP;
END $guard$;
ALTER TABLE education_v30.course_sections SET SCHEMA public;
ALTER TABLE education_v30.foundations SET SCHEMA public;
DO $verify$
DECLARE name text; rows_after bigint;
BEGIN
 FOREACH name IN ARRAY ARRAY['course_sections','foundations'] LOOP
  IF to_regclass('education_v30.'||name) IS NOT NULL OR
    to_regclass('public.'||name) IS NULL
  THEN RAISE EXCEPTION 'Move failed for %',name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',name) INTO rows_after;
  IF rows_after<>0 THEN RAISE EXCEPTION 'Unexpected rows after move for %',name; END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_constraint c WHERE c.contype='f'
      AND c.confrelid IN ('public.course_sections'::regclass,'public.foundations'::regclass))<>7
 THEN RAISE EXCEPTION 'Seven existing inbound foreign keys were not preserved'; END IF;
END $verify$;
COMMIT;
