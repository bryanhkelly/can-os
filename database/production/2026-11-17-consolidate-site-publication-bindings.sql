-- CAN OS: Retire the final native location of Site publication bindings.
-- The authoritative Site identity is public.sites; publication uses same UUID.
-- Preserve table OID, FKs, indexes, owner-only forced RLS and all application rights.
-- Repoint the existing SECURITY DEFINER public-Site projection atomically.
-- No table copy, new bridge, CASCADE or shortcut to publish a draft site.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='50s';
DO $guard$
DECLARE src oid; n bigint; routine_count bigint; definition text; replacement text;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb'
 THEN RAISE EXCEPTION 'Refusing non-main CAN OS database'; END IF;
 src:=to_regclass('education_v30.site_publication_bindings');
 IF src IS NULL OR to_regclass('public.site_publication_bindings') IS NOT NULL
 THEN RAISE EXCEPTION 'Source missing or public Site publication binding collision'; END IF;
 LOCK TABLE education_v30.site_publication_bindings IN ACCESS EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=src AND c.relkind='r'
   AND c.relowner='neondb_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
   OR (SELECT count(*) FROM pg_policy p WHERE p.polrelid=src)<>1
   OR EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=src
     AND p.polroles<>ARRAY['neondb_owner'::regrole]::oid[])
   OR (SELECT count(*) FROM pg_constraint f WHERE f.conrelid=src AND f.contype='f' AND f.convalidated)<>1
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.conrelid=src AND f.contype='f' AND NOT f.convalidated)
   OR EXISTS(SELECT 1 FROM pg_constraint f WHERE f.confrelid=src AND f.contype='f')
   OR EXISTS(SELECT 1 FROM pg_trigger tr WHERE tr.tgrelid=src AND NOT tr.tgisinternal)
   OR EXISTS(SELECT 1 FROM pg_depend d WHERE d.refobjid=src AND d.deptype='n'
     AND d.classid NOT IN('pg_constraint'::regclass,'pg_policy'::regclass))
   OR has_table_privilege('authenticated',src,'SELECT')
   OR has_table_privilege('anonymous',src,'SELECT')
 THEN RAISE EXCEPTION 'Site publication policy or dependency drift'; END IF;
 SELECT count(*) INTO n FROM education_v30.site_publication_bindings;
 IF n<>0 THEN RAISE EXCEPTION 'Source Site binding table has % rows',n; END IF;
 IF (SELECT count(*) FROM pg_index i WHERE i.indrelid=src)<>2
   OR EXISTS(SELECT 1 FROM pg_index i JOIN pg_class idx ON idx.oid=i.indexrelid
     WHERE i.indrelid=src AND EXISTS(
       SELECT 1 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace
       WHERE ns.nspname='public' AND c.relname=idx.relname))
 THEN RAISE EXCEPTION 'Index inventory changed'; END IF;
 SELECT count(*) INTO routine_count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN('public','education_v30','education_v30_secure') AND p.prokind IN('f','p')
   AND pg_get_functiondef(p.oid) ~* '(^|[^[:alnum:]_])site_publication_bindings([^[:alnum:]_]|$)';
 IF routine_count<>1 THEN
   RAISE EXCEPTION 'Expected one dependent projection, found %',routine_count;
 END IF;
 SELECT pg_get_functiondef(p.oid) INTO definition
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='education_v30' AND p.proname='v301_public_site_claims';
 IF definition IS NULL
  OR (length(definition)-length(replace(definition,'FROM site_publication_bindings b','')))
       /length('FROM site_publication_bindings b')<>1
  OR position('SECURITY DEFINER' IN definition)=0
 THEN RAISE EXCEPTION 'Public-site reader has unexpected implementation'; END IF;
 PERFORM set_config('can.site_publication_rewrite', definition, true);
END $guard$;
ALTER TABLE education_v30.site_publication_bindings SET SCHEMA public;
DO $rewrite$
DECLARE original text;
BEGIN
 original:=current_setting('can.site_publication_rewrite');
 EXECUTE replace(original,'FROM site_publication_bindings b','FROM public.site_publication_bindings b');
END $rewrite$;
COMMIT;
