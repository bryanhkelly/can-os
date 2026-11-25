-- Geographic observations are independent of canonical regulatory Site geography.
-- No market membership confers tenant, organizational, or program authority.
CREATE TABLE public.geographic_area_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 area_id uuid NOT NULL REFERENCES public.geographic_areas(id) ON DELETE RESTRICT,
 source text NOT NULL, benchmark text NOT NULL, vintage text NOT NULL,
 name text NOT NULL, kind text NOT NULL, source_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(area_id,source,benchmark,vintage)
);
CREATE TABLE public.geographic_area_relationships (
 child_version_id uuid NOT NULL REFERENCES public.geographic_area_versions(id),
 parent_version_id uuid NOT NULL REFERENCES public.geographic_area_versions(id),
 relationship text NOT NULL CHECK(relationship IN ('contained_in','market_member')),
 PRIMARY KEY(child_version_id,parent_version_id,relationship),
 CHECK(child_version_id<>parent_version_id)
);
CREATE TABLE public.site_geography_jobs (
 site_id uuid PRIMARY KEY REFERENCES public.sites(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 generation uuid NOT NULL DEFAULT gen_random_uuid(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','resolved','unresolved','unsupported','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE INDEX site_geography_job_due_idx ON public.site_geography_jobs(next_attempt_at,site_id) WHERE status IN ('pending','processing');
CREATE TABLE public.site_geography_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 site_id uuid NOT NULL REFERENCES public.sites(id) ON DELETE RESTRICT,
 organization_id uuid NOT NULL REFERENCES public.organizations(id),
 generation uuid NOT NULL UNIQUE,
 source text NOT NULL, benchmark text NOT NULL, vintage text NOT NULL,
 latitude double precision NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude double precision NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 market_status text NOT NULL CHECK(market_status IN ('metro','micro','outside_market','unknown')),
 resolved_at timestamptz NOT NULL DEFAULT now(), superseded_at timestamptz,
 CHECK(superseded_at IS NULL OR superseded_at>=resolved_at)
);
CREATE UNIQUE INDEX site_geography_current_uq ON public.site_geography_versions(site_id) WHERE superseded_at IS NULL;
CREATE INDEX site_geography_history_idx ON public.site_geography_versions(organization_id,site_id,resolved_at);
CREATE TABLE public.site_geographic_memberships (
 site_geography_version_id uuid NOT NULL REFERENCES public.site_geography_versions(id) ON DELETE RESTRICT,
 area_version_id uuid NOT NULL REFERENCES public.geographic_area_versions(id) ON DELETE RESTRICT,
 PRIMARY KEY(site_geography_version_id,area_version_id)
);
CREATE INDEX site_geographic_memberships_area_idx ON public.site_geographic_memberships(area_version_id,site_geography_version_id);
CREATE TABLE public.geographic_community_profiles (
 area_id uuid NOT NULL REFERENCES public.geographic_areas(id) ON DELETE RESTRICT,
 source text NOT NULL CHECK(source='acs5'), year integer NOT NULL CHECK(year BETWEEN 2020 AND 2100),
 indicators jsonb NOT NULL CHECK(jsonb_typeof(indicators)='object'),
 retrieved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(area_id,source,year)
);
CREATE TABLE public.geographic_profile_jobs (
 area_version_id uuid NOT NULL REFERENCES public.geographic_area_versions(id) ON DELETE RESTRICT,
 year integer NOT NULL CHECK(year BETWEEN 2020 AND 2100),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','resolved','unresolved','failed')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 4),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid, lease_until timestamptz,
 PRIMARY KEY(area_version_id,year),
 CHECK((status='processing')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
--> statement-breakpoint
-- Same transaction as address changes. No remote requests and no private address copies.
CREATE FUNCTION public.queue_site_geography() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address
  AND NEW.site_kind IS NOT DISTINCT FROM OLD.site_kind AND NEW.organization_id=OLD.organization_id
 THEN RETURN NEW; END IF;
 UPDATE public.site_geography_versions SET superseded_at=now()
 WHERE site_id=NEW.id AND superseded_at IS NULL;
 INSERT INTO public.site_geography_jobs(site_id,organization_id,status)
 VALUES(NEW.id,NEW.organization_id,CASE WHEN NEW.site_kind='physical' AND NEW.address IS NOT NULL THEN 'pending' ELSE 'unsupported' END)
 ON CONFLICT(site_id) DO UPDATE SET organization_id=excluded.organization_id,
 generation=gen_random_uuid(),status=excluded.status,attempts=0,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,updated_at=now();
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_site_geography() FROM PUBLIC,anonymous,authenticated;
CREATE TRIGGER site_geography_address_changed AFTER INSERT OR UPDATE OF address,site_kind,organization_id
 ON public.sites FOR EACH ROW EXECUTE FUNCTION public.queue_site_geography();
-- Backfill is queued, not fabricated or backdated.
INSERT INTO public.site_geography_jobs(site_id,organization_id,status)
 SELECT id,organization_id,CASE WHEN site_kind='physical' AND address IS NOT NULL THEN 'pending' ELSE 'unsupported' END FROM public.sites
 ON CONFLICT(site_id) DO NOTHING;
--> statement-breakpoint
DO $private$ DECLARE relation text; BEGIN
 FOREACH relation IN ARRAY ARRAY['geographic_area_versions','geographic_area_relationships','site_geography_jobs','site_geography_versions','site_geographic_memberships','geographic_community_profiles','geographic_profile_jobs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',relation);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',relation);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anonymous, authenticated',relation);
 END LOOP;
END $private$;
