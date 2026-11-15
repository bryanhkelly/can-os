-- Narrow Site identity mutation role for existing audited three-party review.
-- Apply after patch-site-identity-links.sql and patch-site-identity-confirmation.sql.
-- This role has no login, no BYPASSRLS and no DELETE/TRUNCATE rights.
-- The app switches to it ONLY for the approved INSERT/UPDATE SQL statement
-- within an otherwise normally authorized request transaction.
BEGIN;
DO $role$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='can_v30_site_identity_writer') THEN
    CREATE ROLE can_v30_site_identity_writer NOLOGIN NOBYPASSRLS;
  END IF;
END $role$;
GRANT USAGE ON SCHEMA public TO can_v30_site_identity_writer;
GRANT SELECT, INSERT, UPDATE ON public.site_canonical_identity_links
  TO can_v30_site_identity_writer;
-- The migration's controlling table owner is granted permission to SET ROLE.
-- On a deployment with a separate runtime login, separately grant membership
-- to precisely that reviewed login, never to PUBLIC/anon/learner roles.
DO $membership$
DECLARE table_owner text;
BEGIN
  SELECT pg_get_userbyid(relowner) INTO table_owner
  FROM pg_class WHERE oid='public.site_canonical_identity_links'::regclass;
  EXECUTE format('GRANT can_v30_site_identity_writer TO %I',table_owner);
END $membership$;
DO $policies$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='site_canonical_identity_links'
      AND policyname='site_identity_writer_read') THEN
    CREATE POLICY site_identity_writer_read
      ON public.site_canonical_identity_links
      FOR SELECT TO can_v30_site_identity_writer USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='site_canonical_identity_links'
      AND policyname='site_identity_writer_request') THEN
    CREATE POLICY site_identity_writer_request
      ON public.site_canonical_identity_links
      FOR INSERT TO can_v30_site_identity_writer
      WITH CHECK (
        current_setting('can.site_identity_action',true)='request'
        AND status='pending'
        AND requested_by_person_id::text=current_setting('can.site_identity_actor',true)
        AND reviewed_at IS NULL AND reviewed_by_person_id IS NULL
        AND confirmed_at IS NULL AND confirmed_by_canonical_person_id IS NULL
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='site_canonical_identity_links'
      AND policyname='site_identity_writer_decision') THEN
    CREATE POLICY site_identity_writer_decision
      ON public.site_canonical_identity_links
      FOR UPDATE TO can_v30_site_identity_writer
      USING (status IN ('pending','approved'))
      WITH CHECK (
        (
          current_setting('can.site_identity_action',true)='confirm'
          AND status='pending'
          AND confirmed_at IS NOT NULL
          AND confirmed_by_canonical_person_id::text =
             current_setting('can.site_identity_actor',true)
          AND reviewed_by_person_id IS NULL
        ) OR (
          current_setting('can.site_identity_action',true)='review'
          AND status IN ('approved','rejected','revoked')
          AND reviewed_at IS NOT NULL
          AND reviewed_by_person_id::text =
             current_setting('can.site_identity_actor',true)
          AND requested_by_person_id IS DISTINCT FROM reviewed_by_person_id
          AND (status<>'approved' OR confirmed_at IS NOT NULL)
        )
      );
  END IF;
END $policies$;
COMMIT;
-- Always verify actual production DATABASE_URL login membership before release.
-- No transition can be executed without a server-authorized action + actor.
