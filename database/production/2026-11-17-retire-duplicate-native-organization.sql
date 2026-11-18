-- CAN OS Neon main only: retire the duplicate canonical Organization.
-- The sole authoritative Organization is public.organizations, with the
-- same UUID. Its name, legal name, status and external reference are already
-- preserved. Every existing 154 canonical Organization FK was rebound to
-- public.organizations in previous, independently verified transactions.
-- This migration does not grant permissions, weaken RLS, create an alias,
-- remap a Person, issue an account/session, or copy any records.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$
DECLARE dependent_routines integer; remaining_fks integer; matching integer;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb'
 THEN RAISE EXCEPTION 'Only CAN OS Neon main'; END IF;
 IF to_regclass('education_v30.organizations') IS NULL
    OR to_regclass('public.organizations') IS NULL
 THEN RAISE EXCEPTION 'Unexpected Organization table state'; END IF;
 SELECT count(*) INTO matching
 FROM education_v30.organizations n
 JOIN public.organizations p ON p.id=n.id
 WHERE p.name=n.display_name AND p.legal_name IS NOT DISTINCT FROM n.legal_name
  AND p.external_reference IS NOT DISTINCT FROM n.external_reference
  AND p.lifecycle_status=n.status;
 IF matching<>1 OR (SELECT count(*) FROM education_v30.organizations)<>1
 THEN RAISE EXCEPTION 'Duplicate Organization metadata mismatch'; END IF;
 SELECT count(*) INTO remaining_fks FROM pg_constraint
 WHERE contype='f' AND confrelid='education_v30.organizations'::regclass;
 IF remaining_fks<>0 THEN RAISE EXCEPTION 'Remaining duplicate Organization FKs: %',remaining_fks; END IF;
 SELECT count(*) INTO dependent_routines FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','education_v30','education_v30_secure')
 AND p.prokind IN ('f','p')
 AND (p.prosrc ILIKE '%education_v30.organizations%'
   OR (n.nspname='education_v30'
       AND p.prosrc ~* '\\m(from|join|update|into)\\s+organizations\\M'));
 IF dependent_routines<>0 THEN RAISE EXCEPTION 'Unmigrated canonical Organization routines: %',dependent_routines; END IF;
 IF EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%education_v30.organizations%')
 THEN RAISE EXCEPTION 'Views still use duplicate Organization'; END IF;
END $guard$;
DROP TABLE education_v30.organizations RESTRICT;
DO $verify$
BEGIN
 IF to_regclass('education_v30.organizations') IS NOT NULL
   OR to_regclass('public.organizations') IS NULL
 THEN RAISE EXCEPTION 'Duplicate Organization retirement incomplete'; END IF;
 IF (SELECT count(*) FROM public.organizations)<>17
 THEN RAISE EXCEPTION 'Authoritative Organization row count changed'; END IF;
END $verify$;
COMMIT;
