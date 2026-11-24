-- Canonical Site address writes may precede site_kind classification.
-- Explicit physical-address revision or physical/both delivery metadata is sufficient
-- for legacy unclassified Sites. Virtual/mobile and synthetic Sites are excluded.
CREATE FUNCTION public.site_geography_eligible(kind text, metadata jsonb, address jsonb)
 RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,public AS $$
 SELECT address IS NOT NULL
  AND coalesce(metadata->>'synthetic','false')<>'true'
  AND coalesce(metadata#>>'{siteEnvironmentV61,delivery}','')<>'digital'
  AND (kind='physical' OR (kind IS NULL AND
    (jsonb_typeof(metadata->'sitePhysicalAddressRevision')='string'
     OR metadata#>>'{siteEnvironmentV61,delivery}' IN ('physical','both')))) IS TRUE
$$;
REVOKE ALL ON FUNCTION public.site_geography_eligible(text,jsonb,jsonb) FROM PUBLIC,anonymous,authenticated;
CREATE OR REPLACE FUNCTION public.queue_site_geography() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE eligible boolean:=public.site_geography_eligible(NEW.site_kind,NEW.metadata,NEW.address);
BEGIN
 IF TG_OP='UPDATE' AND NEW.address IS NOT DISTINCT FROM OLD.address
  AND NEW.organization_id=OLD.organization_id
  AND eligible=public.site_geography_eligible(OLD.site_kind,OLD.metadata,OLD.address)
 THEN RETURN NEW; END IF;
 UPDATE public.site_geography_versions SET superseded_at=now()
 WHERE site_id=NEW.id AND superseded_at IS NULL;
 INSERT INTO public.site_geography_jobs(site_id,organization_id,status)
 VALUES(NEW.id,NEW.organization_id,CASE WHEN eligible THEN 'pending' ELSE 'unsupported' END)
 ON CONFLICT(site_id) DO UPDATE SET organization_id=excluded.organization_id,
 generation=gen_random_uuid(),status=excluded.status,attempts=0,next_attempt_at=now(),lease_id=NULL,lease_until=NULL,updated_at=now();
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER site_geography_address_changed AFTER INSERT OR UPDATE OF address,site_kind,organization_id,metadata
 ON public.sites FOR EACH ROW EXECUTE FUNCTION public.queue_site_geography();
-- Reconcile queued legacy records without rewriting the canonical Site.
UPDATE public.site_geography_jobs j SET status=CASE WHEN public.site_geography_eligible(s.site_kind,s.metadata,s.address) THEN 'pending' ELSE 'unsupported' END,
 generation=gen_random_uuid(),attempts=0,lease_id=NULL,lease_until=NULL,next_attempt_at=now(),updated_at=now()
 FROM public.sites s WHERE j.site_id=s.id AND j.organization_id=s.organization_id
 AND j.status IN ('pending','unsupported')
 AND (j.status='pending') IS DISTINCT FROM public.site_geography_eligible(s.site_kind,s.metadata,s.address);
