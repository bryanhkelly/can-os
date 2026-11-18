-- Neon CAN OS main: retire the EMPTY, UNUSED native Person access grant model.
-- Existing 21 authoritative public.account_person_grants are preserved.
-- Zero native Persons/accounts, no Person grant rows, callers, incoming FKs
-- or dependent views. RESTRICT protects against concurrent dependencies.
-- Do not run against any other project/branch or replace shared grants.
DO $retire_legacy_person_grants$
DECLARE
  legacy oid := to_regclass('education_v30.person_access_grants')::oid;
  rows_found bigint;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
     OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
     OR current_database() <> 'neondb' THEN
     RAISE EXCEPTION 'CAN OS main database required';
  END IF;
  IF legacy IS NULL THEN
    RAISE NOTICE 'Legacy Person grants already retired';
    RETURN;
  END IF;
  IF to_regclass('public.account_person_grants') IS NULL
     OR (SELECT count(*) FROM public.account_person_grants)<21
     OR EXISTS(SELECT 1 FROM education_v30.persons)
     OR EXISTS(SELECT 1 FROM education_v30.canonical_accounts)
  THEN RAISE EXCEPTION 'Authoritative Person grants or native identity preflight changed'; END IF;
  EXECUTE 'SELECT count(*) FROM education_v30.person_access_grants' INTO rows_found;
  IF rows_found<>0 THEN RAISE EXCEPTION 'Native Person grant history exists; migrate evidence before retirement'; END IF;
  IF EXISTS(SELECT 1 FROM pg_constraint k WHERE k.contype='f' AND k.confrelid=legacy)
     OR EXISTS(SELECT 1 FROM pg_depend d JOIN pg_rewrite r ON r.oid=d.objid WHERE d.refobjid=legacy)
     OR EXISTS(SELECT 1 FROM pg_trigger t WHERE t.tgrelid=legacy AND NOT t.tgisinternal)
     OR EXISTS(
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN ('public','education_v30','education_v30_secure')
         AND p.prokind IN ('f','p')
         AND pg_get_functiondef(p.oid) ILIKE '%person_access_grants%'
     )
  THEN RAISE EXCEPTION 'Legacy grants still have a database consumer'; END IF;
  PERFORM set_config('lock_timeout','5s',true);
  EXECUTE 'DROP TABLE education_v30.person_access_grants RESTRICT';
  IF to_regclass('education_v30.person_access_grants') IS NOT NULL
     OR to_regclass('public.account_person_grants') IS NULL
  THEN RAISE EXCEPTION 'Legacy Person grants retirement incomplete'; END IF;
END
$retire_legacy_person_grants$;
