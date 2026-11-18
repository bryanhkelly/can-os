-- Move existing empty Site-device capability to the shared public schema.
-- Preserves original table OIDs, FK definitions, indexes, permissions, and RLS.
-- No duplication, no new identity, no CASCADE, no data loss.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $guard$
DECLARE t text; n bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
  OR current_database()<>'neondb' THEN
   RAISE EXCEPTION 'Refusing any database other than CAN OS Neon main';
 END IF;
 FOREACH t IN ARRAY ARRAY['site_device_policies','site_device_registrations'] LOOP
  IF to_regclass('education_v30.'||t) IS NULL OR to_regclass('public.'||t) IS NOT NULL
  THEN RAISE EXCEPTION 'Source missing or collision: %',t; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('education_v30.'||t)
       AND c.relrowsecurity AND NOT c.relforcerowsecurity)
  THEN RAISE EXCEPTION 'Unexpected RLS state: %',t; END IF;
  IF EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=to_regclass('education_v30.'||t))
   OR EXISTS (SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=to_regclass('education_v30.'||t) AND NOT tr.tgisinternal)
   OR EXISTS (SELECT 1 FROM pg_constraint c WHERE c.confrelid=to_regclass('education_v30.'||t) AND c.contype='f')
  THEN RAISE EXCEPTION 'Unexpected policy, trigger, or inbound FK: %',t; END IF;
  EXECUTE format('SELECT count(*) FROM education_v30.%I',t) INTO n;
  IF n<>0 THEN RAISE EXCEPTION 'The source table % is populated',t; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
  WHERE ns.nspname IN ('public','education_v30','education_v30_secure') AND p.prokind IN ('f','p')
    AND (pg_get_functiondef(p.oid) ILIKE '%site_device_policies%'
      OR pg_get_functiondef(p.oid) ILIKE '%site_device_registrations%'))
 THEN RAISE EXCEPTION 'Referenced from SQL routine'; END IF;
END $guard$;
ALTER TABLE education_v30.site_device_policies SET SCHEMA public;
ALTER TABLE education_v30.site_device_registrations SET SCHEMA public;
COMMIT;
