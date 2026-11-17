-- CAN OS main-only: move eight empty, noncolliding operational tables.
-- Verified: no runtime indexed name references, views, functions, policies,
-- explicit ACLs or user triggers on these exact tables. No identity bridges.
-- FK dependencies retain object OIDs; this is additive to public schema.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $preflight$
DECLARE name text; obj oid; n bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing non-main Neon branch'; END IF;
 FOREACH name IN ARRAY ARRAY[
    'curriculum_rights_grants',
    'institutional_approvals',
    'organization_classifications',
    'organization_relationships',
    'production_opportunities',
    'provider_authorizations',
    'provider_eligibility_reviews',
    'session_staff'
 ] LOOP
   obj:=to_regclass('education_v30.'||name);
   IF obj IS NULL OR to_regclass('public.'||name) IS NOT NULL
   THEN RAISE EXCEPTION 'Missing source or conflicting destination: %',name; END IF;
   IF NOT EXISTS(
     SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
       AND NOT c.relrowsecurity AND NOT c.relforcerowsecurity AND c.relacl IS NULL
   ) OR EXISTS (
     SELECT 1 FROM pg_policies WHERE schemaname='education_v30' AND tablename=name
   ) OR EXISTS (
     SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal
   ) OR EXISTS (
     SELECT 1 FROM pg_proc p WHERE p.prokind IN ('f','p') AND p.prosrc ILIKE '%'||name||'%'
   ) OR EXISTS(
     SELECT 1 FROM pg_views v WHERE v.definition ILIKE '%'||name||'%'
   ) THEN RAISE EXCEPTION 'Unexpected dependency: %',name; END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',name) INTO n;
   IF n<>0 THEN RAISE EXCEPTION 'Nonempty source table: %',name; END IF;
 END LOOP;
END $preflight$;
ALTER TABLE education_v30.curriculum_rights_grants SET SCHEMA public;
ALTER TABLE education_v30.institutional_approvals SET SCHEMA public;
ALTER TABLE education_v30.organization_classifications SET SCHEMA public;
ALTER TABLE education_v30.organization_relationships SET SCHEMA public;
ALTER TABLE education_v30.production_opportunities SET SCHEMA public;
ALTER TABLE education_v30.provider_authorizations SET SCHEMA public;
ALTER TABLE education_v30.provider_eligibility_reviews SET SCHEMA public;
ALTER TABLE education_v30.session_staff SET SCHEMA public;
DO $verify$
DECLARE name text; n bigint;
BEGIN
 FOREACH name IN ARRAY ARRAY[
    'curriculum_rights_grants',
    'institutional_approvals',
    'organization_classifications',
    'organization_relationships',
    'production_opportunities',
    'provider_authorizations',
    'provider_eligibility_reviews',
    'session_staff'
 ] LOOP
  IF to_regclass('education_v30.'||name) IS NOT NULL
    OR to_regclass('public.'||name) IS NULL
  THEN RAISE EXCEPTION 'Migration verification failed: %',name; END IF;
  EXECUTE format('SELECT count(*) FROM public.%I',name) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'Unexpected rows in moved relation: %',name; END IF;
 END LOOP;
END $verify$;
COMMIT;
