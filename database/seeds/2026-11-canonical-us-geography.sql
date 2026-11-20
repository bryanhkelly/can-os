-- Additive canonical Program Catalog geography reference data.
-- Derived from already-populated public.jurisdictions verified US reference entries
-- (drizzle/0078_jurisdiction_reference_catalog.sql). Synthetic/test jurisdiction
-- rows are explicitly excluded by exact ISO-style code and region match.
-- This does not classify Sites, approve state operation, publish courses,
-- grant database roles, create regulatory rules, or open enrollment.
-- Execute as one transaction; no writes to public.sites.
BEGIN;
DO $guard$
BEGIN
 IF (SELECT COUNT(*) FROM public.jurisdictions j
     WHERE j.country_code='US' AND j.code ~ '^US-[A-Z]{2}$'
       AND j.region_code=right(j.code,2)) <> 56
 THEN RAISE EXCEPTION 'Expected 56 authoritative US state/district/territory reference rows; review source';
 END IF;
END $guard$;

INSERT INTO public.geographic_areas(code,name,level_code,parent_id)
 VALUES ('US','United States','country',NULL)
 ON CONFLICT (code) DO NOTHING;

INSERT INTO public.geographic_areas(code,name,level_code,parent_id)
 SELECT j.code,j.name,
   CASE WHEN j.code='US-DC' THEN 'federal_district'
        WHEN j.code IN ('US-AS','US-GU','US-MP','US-PR','US-VI') THEN 'territory'
        ELSE 'state' END,
   parent.id
 FROM public.jurisdictions j CROSS JOIN public.geographic_areas parent
 WHERE parent.code='US'
   AND j.country_code='US'
   AND j.code ~ '^US-[A-Z]{2}$'
   AND j.region_code=right(j.code,2)
   AND j.name IS NOT NULL AND length(trim(j.name))>0
 ON CONFLICT (code) DO NOTHING;

DO $verify$
BEGIN
 IF (SELECT count(*) FROM public.geographic_areas
     WHERE code='US' AND level_code='country' AND parent_id IS NULL)<>1
 OR (SELECT count(*) FROM public.geographic_areas g
     JOIN public.geographic_areas p ON p.id=g.parent_id
     WHERE p.code='US' AND g.code ~ '^US-[A-Z]{2}$')<>56
 THEN RAISE EXCEPTION 'US geography hierarchy incomplete; transaction rolls back'; END IF;
END $verify$;
COMMIT;
