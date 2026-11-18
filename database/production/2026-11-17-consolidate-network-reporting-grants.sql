-- CAN OS production main: relocate original empty aggregate-reporting authorization table.
-- Preserve OID, four validated FKs, existing owner-only forced RLS and indexes.
-- No new access grant, duplicate role mechanism, DROP, CASCADE, or row copy.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
DECLARE obj oid; n bigint;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
  OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
  OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Refusing non-main CAN OS Neon database';
 END IF;
 obj:=to_regclass('education_v30.network_reporting_grants');
 IF obj IS NULL OR to_regclass('public.network_reporting_grants') IS NOT NULL
 THEN RAISE EXCEPTION 'Source missing or destination collision'; END IF;
 LOCK TABLE education_v30.network_reporting_grants IN ACCESS EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=obj AND c.relkind='r'
    AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
    OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=obj)<>1
    OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=obj
      AND p.polroles<>ARRAY['neondb_owner'::regrole]::oid[])
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.confrelid=obj)
    OR (SELECT count(*) FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=obj AND f.convalidated)<>4
    OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.contype='f' AND f.conrelid=obj AND NOT f.convalidated)
    OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=obj AND NOT t.tgisinternal)
    OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=obj AND d.deptype='n'
      AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
    OR has_table_privilege('authenticated',obj,'SELECT')
    OR has_table_privilege('anonymous',obj,'SELECT')
 THEN RAISE EXCEPTION 'Unexpected authorization or physical table dependencies'; END IF;
 SELECT count(*) INTO n FROM education_v30.network_reporting_grants;
 IF n<>0 THEN RAISE EXCEPTION 'Source table contains % records',n; END IF;
 IF (SELECT count(*) FROM pg_index i WHERE i.indrelid=obj)<>2
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
     WHERE i.indrelid=obj AND EXISTS(
       SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
       WHERE ns.nspname='public' AND c.relname=idx.relname))
 THEN RAISE EXCEPTION 'Index inventory or public name collision changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace
   WHERE ns.nspname IN('public','education_v30','education_v30_secure')
    AND p.prokind IN('f','p')
    AND pg_get_functiondef(p.oid) ~* '(^|[^[:alnum:]_])network_reporting_grants([^[:alnum:]_]|$)')
 THEN RAISE EXCEPTION 'Unexpected SQL function referring to source table'; END IF;
END $guard$;
ALTER TABLE education_v30.network_reporting_grants SET SCHEMA public;
COMMIT;
