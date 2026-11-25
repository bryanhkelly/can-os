-- A valid physical address is eligible regardless of fixture provenance.
-- Preserve digital/virtual/mobile exclusions and existing job/lease boundaries.
CREATE OR REPLACE FUNCTION public.site_geography_eligible(kind text, metadata jsonb, address jsonb)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT address IS NOT NULL
  AND coalesce(metadata#>>'{siteEnvironmentV61,delivery}','')<>'digital'
  AND (kind='physical' OR (kind IS NULL AND
    (jsonb_typeof(metadata->'sitePhysicalAddressRevision')='string'
     OR metadata#>>'{siteEnvironmentV61,delivery}' IN ('physical','both')))) IS TRUE
$$;
--> statement-breakpoint
-- Only reset jobs which were excluded by the former synthetic-only gate.
UPDATE public.site_geography_jobs j SET status='pending',
 generation=gen_random_uuid(),attempts=0,lease_id=NULL,lease_until=NULL,
 next_attempt_at=now(),updated_at=now()
 FROM public.sites s WHERE j.site_id=s.id AND j.organization_id=s.organization_id
 AND j.status='unsupported' AND s.metadata->>'synthetic'='true'
 AND public.site_geography_eligible(s.site_kind,s.metadata,s.address);
