-- CAN OS Neon main: move original empty database-role organization scope grants to public.
-- Preserve table OID, FK, index inventory, owner-only forced RLS, and all session role semantics.
-- Two existing SECURITY DEFINER authorization functions re-point atomically.
-- No new grant, no privilege broadening, no data copy, DROP, or bridge.
BEGIN;

-- STEP 1
SET LOCAL lock_timeout='5s';

-- STEP 2
SET LOCAL statement_timeout='60s';

-- STEP 3
DO $preflight$
DECLARE src oid; n bigint; hits int; fn record; def text; total_refs bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
   OR current_database() <> 'neondb'
 THEN RAISE EXCEPTION 'CAN OS production main required'; END IF;
 src:=to_regclass('education_v30.database_role_organization_bindings');
 IF src IS DISTINCT FROM '416485'::oid OR to_regclass('public.database_role_organization_bindings') IS NOT NULL
 THEN RAISE EXCEPTION 'Source OID or destination changed'; END IF;
 LOCK TABLE education_v30.database_role_organization_bindings IN ACCESS EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=src AND c.relkind='r'
   AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=src AND
      p.polroles=ARRAY['neondb_owner'::regrole]::oid[] AND p.polcmd='*')<>1
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=src)<>1
   OR (SELECT count(*) FROM pg_constraint f WHERE f.conrelid=src AND f.contype='f' AND f.convalidated)<>1
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=src AND f.contype='f' AND NOT f.convalidated)
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.confrelid=src AND f.contype='f')
   OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=src AND NOT t.tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=src AND d.deptype='n'
     AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
   OR has_table_privilege('authenticated',src,'SELECT')
   OR has_table_privilege('anonymous',src,'SELECT')
 THEN RAISE EXCEPTION 'Unexpected role-table permission or dependencies'; END IF;
 SELECT count(*) INTO n FROM education_v30.database_role_organization_bindings;
 IF n<>0 THEN RAISE EXCEPTION 'Role binding table is populated; refuse relocation'; END IF;
 IF (SELECT count(*) FROM pg_index i WHERE i.indrelid=src)<>2
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
     WHERE i.indrelid=src AND EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
       WHERE ns.nspname='public' AND c.relname=idx.relname))
 THEN RAISE EXCEPTION 'Unexpected index drift or public collision'; END IF;
 SELECT count(*) INTO total_refs FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
 WHERE ns.nspname IN ('public','education_v30','education_v30_secure') AND p.prokind IN ('f','p')
  AND pg_get_functiondef(p.oid) ILIKE '%database_role_organization_bindings%';
 IF total_refs<>2 THEN RAISE EXCEPTION 'Expected 2 existing authorization readers, found %',total_refs; END IF;
 FOR fn IN SELECT * FROM (VALUES
   ('v28_role_can_access_org','416505'::oid),
   ('v28_role_has_purpose','416506'::oid)
 ) AS x(name,expected_oid) LOOP
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='education_v30' AND p.proname=fn.name
      AND p.oid=fn.expected_oid AND p.prosecdef;
  IF def IS NULL THEN RAISE EXCEPTION 'Missing privileged authorization function %',fn.name; END IF;
  hits:=(length(def)-length(replace(def,'FROM database_role_organization_bindings b','')))
       /length('FROM database_role_organization_bindings b');
  IF hits<>1 THEN RAISE EXCEPTION 'Unexpected authorization SQL for %',fn.name; END IF;
 END LOOP;
END $preflight$;

-- STEP 4
ALTER TABLE education_v30.database_role_organization_bindings SET SCHEMA public;

-- STEP 5
DO $rewrite$
DECLARE fn text; def text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['v28_role_can_access_org','v28_role_has_purpose'] LOOP
  SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
    WHERE ns.nspname='education_v30' AND p.proname=fn AND p.prosecdef;
  IF def IS NULL OR (length(def)-length(replace(def,'FROM database_role_organization_bindings b','')))
    /length('FROM database_role_organization_bindings b')<>1
  THEN RAISE EXCEPTION 'Security definer function changed: %',fn; END IF;
  EXECUTE replace(def,'FROM database_role_organization_bindings b',
    'FROM public.database_role_organization_bindings b');
 END LOOP;
END $rewrite$;

COMMIT;
