-- CAN OS Neon main: protect existing public.people ahead of Person cutover.
-- This is NOT a native Person FK migration and does not alter Person ownership,
-- guardian relations, staff role grants, accounts, sessions, or correspondence.
-- It closes the inherited direct authenticated client read/write surface,
-- mirroring the current security posture of public.sites/organizations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='35s';
DO $preflight$
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
 OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Refusing any other database branch'; END IF;
 IF to_regclass('public.people') IS NULL
 OR (SELECT count(*) FROM public.people)<>142
 THEN RAISE EXCEPTION 'Authoritative People row count or table changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies
 WHERE schemaname='public' AND tablename='people')
 OR (SELECT relrowsecurity OR relforcerowsecurity FROM pg_class
     WHERE oid='public.people'::regclass)
 THEN RAISE EXCEPTION 'People RLS has unreviewed existing policies'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='neondb_owner' AND rolbypassrls)
 THEN RAISE EXCEPTION 'Privileged application DB role cannot be verified'; END IF;
END $preflight$;
ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.people FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.people FROM PUBLIC,authenticated,anonymous;
CREATE POLICY people_no_direct_client_access ON public.people
 AS RESTRICTIVE FOR ALL TO authenticated,anonymous
 USING (false) WITH CHECK(false);
DO $verify$
BEGIN
 IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class
   WHERE oid='public.people'::regclass)
 THEN RAISE EXCEPTION 'People forced RLS absent'; END IF;
 IF has_table_privilege('authenticated','public.people','SELECT')
 OR has_table_privilege('authenticated','public.people','INSERT')
 OR has_table_privilege('authenticated','public.people','UPDATE')
 OR has_table_privilege('authenticated','public.people','DELETE')
 OR has_table_privilege('anonymous','public.people','SELECT')
 THEN RAISE EXCEPTION 'Unrestricted People client access persists'; END IF;
 IF (SELECT count(*) FROM public.people)<>142
 THEN RAISE EXCEPTION 'People data changed during RLS migration'; END IF;
END $verify$;
COMMIT;
