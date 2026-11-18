-- CAN OS Neon main: consolidate populated, ACTIVE deployment offering adoptions.
-- Retain the original table OID, one persisted adoption, 7 incoming FKs,
-- 3 outgoing FKs, 3 RLS policies and exact owner-only access.
-- Rebind its only SQL trigger-function consumer in this SAME transaction.
-- No copied table, no new identity mapping, no CASCADE.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE t oid; f oid; def text;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Production Neon main only'; END IF;
 t:=to_regclass('education_v30.deployment_offering_adoptions');
 f:=to_regprocedure('education_v30.validate_instructional_track_policy_publication()');
 IF t IS DISTINCT FROM 404771::oid OR f IS DISTINCT FROM 409523::oid
  OR to_regclass('public.deployment_offering_adoptions') IS NOT NULL
 THEN RAISE EXCEPTION 'Adoption relation or dependent function changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t AND c.relkind='r'
  AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>3
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>3
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>7
 OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal)
 OR (SELECT count(*) FROM education_v30.deployment_offering_adoptions)<>1
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class ix ON ix.oid=i.indexrelid
  JOIN pg_class pub ON pub.relnamespace='public'::regnamespace AND pub.relname=ix.relname
  WHERE i.indrelid=t)
 THEN RAISE EXCEPTION 'Data, policy, grants, FKs or index collision'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f AND NOT p.prosecdef
  AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
  AND p.proacl IS NULL AND p.prosrc LIKE '%FROM deployment_offering_adoptions a%')
 THEN RAISE EXCEPTION 'Adoption validation routine contract changed'; END IF;
END $preflight$;
ALTER TABLE education_v30.deployment_offering_adoptions SET SCHEMA public;
DO $rebind$
DECLARE def text;
BEGIN
  def:=pg_get_functiondef('education_v30.validate_instructional_track_policy_publication()'::regprocedure);
  IF strpos(def,'FROM deployment_offering_adoptions a')=0
  THEN RAISE EXCEPTION 'Could not find the guarded adoption lookup'; END IF;
  EXECUTE replace(def,'FROM deployment_offering_adoptions a',
    'FROM public.deployment_offering_adoptions a');
END $rebind$;
DO $verify$
DECLARE t oid; f oid;
BEGIN
 t:=to_regclass('public.deployment_offering_adoptions');
 f:=to_regprocedure('education_v30.validate_instructional_track_policy_publication()');
 IF t IS DISTINCT FROM 404771::oid OR f IS DISTINCT FROM 409523::oid
 OR to_regclass('education_v30.deployment_offering_adoptions') IS NOT NULL
 THEN RAISE EXCEPTION 'Original adoption identity was not preserved'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t AND c.relkind='r'
  AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
 OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>3
 OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>3
 OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>7
 OR (SELECT count(*) FROM public.deployment_offering_adoptions)<>1
 OR has_table_privilege('authenticated',t,'SELECT')
 OR has_table_privilege('authenticated',t,'INSERT')
 THEN RAISE EXCEPTION 'Adoption data, RLS or FKs changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f AND NOT p.prosecdef
   AND p.proconfig=ARRAY['search_path=education_v30, pg_catalog']::text[]
   AND p.proacl IS NULL
   AND p.prosrc LIKE '%FROM public.deployment_offering_adoptions a%'
   AND p.prosrc NOT LIKE '%FROM deployment_offering_adoptions a%')
 THEN RAISE EXCEPTION 'Adoption validator was not rebound safely'; END IF;
END $verify$;
COMMIT;
