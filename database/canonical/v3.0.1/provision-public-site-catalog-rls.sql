-- SECURITY REVIEW REQUIRED. Manual DBA-only candidate, never run by app startup.
-- This grants no PostgreSQL table privileges and no publication/approval rights.
-- Roles still need explicit column grants and current, approved organization-purpose
-- bindings. Only a currently active Site operator relationship may expose a Site.
-- Keep the separate restrictive anonymous/authenticated denial policy intact.
\set ON_ERROR_STOP on

BEGIN;

DO $policy_guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'sites'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN
    RAISE EXCEPTION 'public.sites must have RLS enabled and forced';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sites'
      AND policyname = 'sites_no_direct_client_access'
  ) THEN
    RAISE EXCEPTION 'Direct authenticated/anonymous Site denial must remain intact';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'sites'
      AND policyname = 'sites_canonical_catalog_operator_read'
  ) THEN
    RAISE EXCEPTION 'An existing Site catalog policy requires manual review, not overwrite';
  END IF;
  IF to_regprocedure('education_v30.v28_role_can_access_org(uuid,text)') IS NULL
    OR to_regclass('public.site_organization_roles') IS NULL THEN
    RAISE EXCEPTION 'Canonical operator authorization prerequisites are missing';
  END IF;
END $policy_guard$;

CREATE POLICY sites_canonical_catalog_operator_read
  ON public.sites AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (
    lifecycle_status IN ('planning', 'active')
    AND EXISTS (
      SELECT 1 FROM public.site_organization_roles AS operator_role
      WHERE operator_role.site_id = sites.id
        AND operator_role.role_code = 'operator'
        AND operator_role.valid_from <= clock_timestamp()
        AND (operator_role.valid_through IS NULL
          OR operator_role.valid_through > clock_timestamp())
        AND (
          education_v30.v28_role_can_access_org(
            operator_role.organization_id, 'program_catalog')
          OR education_v30.v28_role_can_access_org(
            operator_role.organization_id, 'blueprint_author')
        )
    )
  );

COMMIT;

-- After review and controlled application, verify only exact approved
-- organization-purpose roles can see their active Site operator rows.
-- Also test revoked operators, other Sites, anonymous/authenticated clients,
-- and closed/unclassified Sites with actual restricted-role connections.
