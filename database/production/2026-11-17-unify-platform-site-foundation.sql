-- CAN OS: phase 1 of consolidation into the existing public schema.
-- Target: Neon main. This is deliberately additive, not a completed cutover.
-- Preserve ALL public.sites IDs and public.organizations IDs.
-- No bridges, crosswalks, second Site table, backfill, or inferred identity.
-- Deployment: commit matching Drizzle schema first; apply with reviewed change window.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE public.sites
  ADD COLUMN IF NOT EXISTS site_kind text,
  ADD COLUMN IF NOT EXISTS capacity integer,
  ADD COLUMN IF NOT EXISTS lifecycle_status text,
  ADD COLUMN IF NOT EXISTS reference_code text,
  ADD COLUMN IF NOT EXISTS geographic_area_id uuid;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS lifecycle_status text,
  ADD COLUMN IF NOT EXISTS external_reference text;

DO $checks$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sites'::regclass
    AND conname='sites_shared_kind_check') THEN
   ALTER TABLE public.sites ADD CONSTRAINT sites_shared_kind_check
     CHECK (site_kind IS NULL OR site_kind IN ('physical','virtual','mobile'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sites'::regclass
    AND conname='sites_shared_capacity_check') THEN
   ALTER TABLE public.sites ADD CONSTRAINT sites_shared_capacity_check
     CHECK (capacity IS NULL OR capacity >= 0);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.sites'::regclass
    AND conname='sites_shared_lifecycle_check') THEN
   ALTER TABLE public.sites ADD CONSTRAINT sites_shared_lifecycle_check
     CHECK (lifecycle_status IS NULL OR lifecycle_status IN ('planning','active','closed'));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.organizations'::regclass
    AND conname='organizations_shared_lifecycle_check') THEN
   ALTER TABLE public.organizations ADD CONSTRAINT organizations_shared_lifecycle_check
     CHECK (lifecycle_status IS NULL OR lifecycle_status IN ('prospective','active','inactive','closed'));
 END IF;
END
$checks$;

CREATE UNIQUE INDEX IF NOT EXISTS sites_shared_reference_code_uq
  ON public.sites(reference_code) WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS organizations_shared_external_reference_uq
  ON public.organizations(external_reference) WHERE external_reference IS NOT NULL;

-- No guessed values for existing Sites/Organizations, no extra permissions,
-- no forced RLS switch, no new bridge tables and no existing relationship edits.
-- Later FK cutover must preserve scoped authorization and source provenance.
COMMIT;
