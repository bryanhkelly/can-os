-- Production-only, strictly READ-ONLY reusable Site correspondence role.
-- No login, no password, no BYPASSRLS. Do not copy test01 credentials,
-- expose learner records or grant this role to the browser/anonymous users.
-- It does not by itself enable canonical enrollments or assert the deployed
-- Cloudflare runtime's database role.
BEGIN;
DO $site_reader_role$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='can_v30_public_site_reader') THEN
   CREATE ROLE can_v30_public_site_reader NOLOGIN NOBYPASSRLS;
 END IF;
END $site_reader_role$;

GRANT USAGE ON SCHEMA public TO can_v30_public_site_reader;
GRANT SELECT ON public.site_canonical_identity_links TO can_v30_public_site_reader;

-- Neon may implicitly grant role membership with SET FALSE to the creating
-- role. Explicitly allow only the reviewed table owner to exercise the
-- read-only role for RLS acceptance checks. No login is created.
DO $site_reader_owner$
DECLARE owner_name text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO owner_name FROM pg_class
    WHERE oid='public.site_canonical_identity_links'::regclass;
  EXECUTE format('GRANT can_v30_public_site_reader TO %I WITH SET TRUE, INHERIT FALSE',owner_name);
END $site_reader_owner$;

DO $site_reader_policy$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='public'
        AND tablename='site_canonical_identity_links'
        AND policyname='site_identity_links_reader_read') THEN
   CREATE POLICY site_identity_links_reader_read
     ON public.site_canonical_identity_links
     FOR SELECT TO can_v30_public_site_reader
     USING (status='approved');
 END IF;
END $site_reader_policy$;

-- Deliberately do NOT GRANT SELECT on enrollment claims, native identities,
-- participant rosters or arbitrary canonical tables. A reviewed backend
-- release-read projection and exact deployed DB login must be verified
-- independently before a runtime role is granted any additional access.
COMMIT;
