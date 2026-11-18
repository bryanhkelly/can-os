-- CAN OS Neon main: all Organization reads/writes use vetted server commands.
-- Eliminate direct client role access to shared Organization identity, matching
-- the already retired duplicate Site and public.sites security policy.
-- Keep app owner's BYPASSRLS unchanged and all Organization IDs intact.
-- NO broad SELECT policy, no JWT-to-identity inference, no new bridge.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='40s';
DO $guard$
DECLARE access_roles integer;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
 IF to_regclass('public.organizations') IS NULL
    OR to_regclass('education_v30.organizations') IS NOT NULL
 THEN RAISE EXCEPTION 'Organization consolidation not completed'; END IF;
 IF (SELECT count(*) FROM public.organizations)<>17
 THEN RAISE EXCEPTION 'Organization data changed since review'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies
   WHERE schemaname='public' AND tablename='organizations')
 THEN RAISE EXCEPTION 'Unexpected existing Organization RLS policies'; END IF;
 IF (SELECT relrowsecurity OR relforcerowsecurity FROM pg_class
     WHERE oid='public.organizations'::regclass)
 THEN RAISE EXCEPTION 'Organization RLS state already changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neondb_owner' AND rolbypassrls)
 THEN RAISE EXCEPTION 'Server-side privileged owner not confirmed'; END IF;
END $guard$;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.organizations FROM PUBLIC,authenticated,anonymous;
CREATE POLICY organizations_no_direct_client_access ON public.organizations
  AS RESTRICTIVE FOR ALL TO authenticated,anonymous
  USING (false) WITH CHECK (false);
DO $verify$
BEGIN
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity
   FROM pg_class WHERE oid='public.organizations'::regclass)
 THEN RAISE EXCEPTION 'Organization RLS not enforced'; END IF;
 IF has_table_privilege('authenticated','public.organizations','SELECT')
  OR has_table_privilege('authenticated','public.organizations','INSERT')
  OR has_table_privilege('authenticated','public.organizations','UPDATE')
  OR has_table_privilege('authenticated','public.organizations','DELETE')
  OR has_table_privilege('anonymous','public.organizations','SELECT')
 THEN RAISE EXCEPTION 'Unscoped client Organization permissions remain'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
  AND tablename='organizations' AND policyname='organizations_no_direct_client_access'
  AND permissive='RESTRICTIVE' AND qual='false' AND with_check='false')
 THEN RAISE EXCEPTION 'Explicit restrictive client policy missing'; END IF;
END $verify$;
COMMIT;
