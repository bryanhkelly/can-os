-- Read-only preflight for a DBA. Run against the selected target branch.
-- Does not provision roles, modify policy, seed locations or grant permissions.
-- A passing preflight is necessary but NOT sufficient for RLS/browser acceptance.
SELECT 'canonical_schema_tables' AS check_name,
  CASE WHEN to_regclass('public.sites') IS NOT NULL
    AND to_regclass('public.offerings') IS NOT NULL
    AND to_regclass('public.blueprint_configurations') IS NOT NULL
    AND to_regclass('public.geographic_areas') IS NOT NULL
    AND to_regclass('education_v30.sites') IS NULL
    THEN 'ready' ELSE 'blocked' END AS result,
  'Public Site, Offering, Blueprint and geography ownership' AS description
UNION ALL
SELECT 'availability_function',
  CASE WHEN to_regprocedure('education_v30.v30_catalog_program_availability(uuid,text)') IS NOT NULL
    THEN 'ready' ELSE 'blocked' END,
  'Availability projection function still resides in education_v30'
UNION ALL
SELECT 'site_rls_forced',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname='public' AND c.relname='sites'
      AND c.relrowsecurity AND c.relforcerowsecurity
  ) THEN 'ready' ELSE 'blocked' END,
  'Site table must keep forced RLS'
UNION ALL
SELECT 'client_site_denial',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sites'
      AND policyname='sites_no_direct_client_access'
      AND permissive='RESTRICTIVE' AND qual='false'
  ) THEN 'ready' ELSE 'blocked' END,
  'Authenticated and anonymous direct Site access remains denied'
UNION ALL
SELECT 'scoped_catalog_site_rls',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='sites'
      AND policyname='sites_canonical_catalog_operator_read'
      AND cmd='SELECT' AND permissive='PERMISSIVE'
      AND qual LIKE '%v28_role_can_access_org%'
      AND qual LIKE '%site_organization_roles%'
  ) THEN 'ready' ELSE 'blocked' END,
  'Restricted-purpose roles may read only their current operator Sites'
UNION ALL
SELECT 'catalog_role_provisioned',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname LIKE 'can_v30_program_catalog_%'
  ) THEN 'ready' ELSE 'blocked' END,
  'At least one purpose-bound restricted catalog role exists'
UNION ALL
SELECT 'blueprint_author_provisioned',
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname LIKE 'can_v30_blueprint_author_%'
  ) THEN 'ready' ELSE 'blocked' END,
  'At least one purpose-bound Blueprint author role exists'
UNION ALL
SELECT 'geographic_areas_configured',
  CASE WHEN EXISTS (SELECT 1 FROM public.geographic_areas)
    THEN 'ready' ELSE 'blocked' END,
  'Jurisdiction-aware Offering policies require geographic reference data'
UNION ALL
SELECT 'classified_site_available',
  CASE WHEN EXISTS (
    SELECT 1 FROM public.sites
    WHERE lifecycle_status IN ('planning','active')
      AND geographic_area_id IS NOT NULL
  ) THEN 'ready' ELSE 'blocked' END,
  'At least one authorized planning/active Site has a geographic-area link';
