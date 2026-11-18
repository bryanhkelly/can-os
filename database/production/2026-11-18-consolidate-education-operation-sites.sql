-- CAN OS main-only consolidation: one populated, ACTIVE Operation-to-Site relation.
-- Physically move the original table, retain the existing UUID and FKs, and
-- rebind the one SECURITY DEFINER public-site projection within this transaction.
-- No copied/parallel tables, ID mapping, CASCADE or schema-wide search_path change.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
DO $preflight$
DECLARE t oid; f oid; n bigint; src text;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
  THEN RAISE EXCEPTION 'Wrong database: CAN OS Neon main required'; END IF;
  t:=to_regclass('education_v30.education_operation_sites');
  f:=to_regprocedure('education_v30.v301_public_site_claims(text)');
  IF t IS DISTINCT FROM 402578::oid OR f IS DISTINCT FROM 411645::oid
     OR to_regclass('public.education_operation_sites') IS NOT NULL
  THEN RAISE EXCEPTION 'Operation/Site table or projection function changed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t AND c.relkind='r'
       AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>2
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>2
    OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>0
    OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=t AND NOT tgisinternal)
    OR has_table_privilege('authenticated',t,'SELECT')
    OR (SELECT count(*) FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
      JOIN pg_class pub ON pub.relnamespace='public'::regnamespace
          AND pub.relname=idx.relname WHERE i.indrelid=t)<>0
  THEN RAISE EXCEPTION 'Unexpected grants, RLS, FK or index state'; END IF;
  SELECT count(*) INTO n FROM education_v30.education_operation_sites;
  IF n<>1 THEN RAISE EXCEPTION 'Source row count changed: %',n; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f
       AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
       AND proacl::text='{neondb_owner=X/neondb_owner}')
  THEN RAISE EXCEPTION 'Public-site projection security contract changed'; END IF;
  src:=pg_get_functiondef(f);
  IF strpos(src,'LEFT JOIN education_operation_sites os')=0
     OR strpos(src,'LEFT JOIN public.education_operation_sites os')<>0
  THEN RAISE EXCEPTION 'Unexpected public-site projection source'; END IF;
END $preflight$;
ALTER TABLE education_v30.education_operation_sites SET SCHEMA public;
DO $rebind$
DECLARE def text;
BEGIN
  -- Preserve function identity, owner, EXECUTE grants, SECURITY DEFINER and
  -- narrow, fixed search_path. Qualify only the relocated relation.
  def:=pg_get_functiondef('education_v30.v301_public_site_claims(text)'::regprocedure);
  IF strpos(def,'LEFT JOIN education_operation_sites os')=0
  THEN RAISE EXCEPTION 'Cannot rebind unexpected projection definition'; END IF;
  EXECUTE replace(def,
     'LEFT JOIN education_operation_sites os',
     'LEFT JOIN public.education_operation_sites os');
END $rebind$;
DO $verify$
DECLARE t oid; f oid; n bigint;
BEGIN
  t:=to_regclass('public.education_operation_sites');
  f:=to_regprocedure('education_v30.v301_public_site_claims(text)');
  IF t IS DISTINCT FROM 402578::oid OR f IS DISTINCT FROM 411645::oid
      OR to_regclass('education_v30.education_operation_sites') IS NOT NULL
  THEN RAISE EXCEPTION 'OID-preserving relocation failed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=t AND c.relkind='r'
      AND c.relrowsecurity AND c.relforcerowsecurity AND c.relacl IS NULL)
    OR (SELECT count(*) FROM pg_policy WHERE polrelid=t)<>2
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid=t AND contype='f')<>2
    OR (SELECT count(*) FROM pg_constraint WHERE confrelid=t AND contype='f')<>0
    OR has_table_privilege('authenticated',t,'SELECT')
  THEN RAISE EXCEPTION 'Table identity, constraints or permissions lost'; END IF;
  SELECT count(*) INTO n FROM public.education_operation_sites;
  IF n<>1 THEN RAISE EXCEPTION 'Site relationship record lost'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=f
       AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, education_v30, pg_temp']::text[]
       AND proacl::text='{neondb_owner=X/neondb_owner}'
       AND prosrc LIKE '%LEFT JOIN public.education_operation_sites os%'
       AND prosrc NOT LIKE '%LEFT JOIN education_operation_sites os%')
  THEN RAISE EXCEPTION 'Projection security or table rebinding failed'; END IF;
END $verify$;
-- Compile and execute the existing projection under its unchanged permissions.
SELECT count(*) FROM education_v30.v301_public_site_claims('__consolidation_nonexistent_slug__');
COMMIT;
