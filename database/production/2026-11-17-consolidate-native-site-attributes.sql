-- CAN OS main: preserve the one native demo Site's education attributes
-- on the authoritative public Site row BEFORE retirement of the duplicate.
-- Exact SAME UUID, name and timezone; no crosswalk, no new Site row.
-- Only fills currently empty education-specific fields. Does not invent an
-- address: the native demo address is explicitly synthetic and unverified.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE conflicts bigint; count_rows bigint;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not the CAN OS production main branch'; END IF;
 SELECT count(*) INTO count_rows FROM education_v30.sites;
 IF count_rows<>1 THEN RAISE EXCEPTION 'Native Site row count changed'; END IF;
 SELECT count(*) INTO conflicts
 FROM education_v30.sites n LEFT JOIN public.sites p ON p.id=n.id
 WHERE p.id IS NULL OR p.name<>n.name OR p.timezone<>n.time_zone
    OR (p.site_kind IS NOT NULL AND p.site_kind<>n.site_kind)
    OR (p.lifecycle_status IS NOT NULL AND p.lifecycle_status<>n.status)
    OR (p.reference_code IS NOT NULL AND p.reference_code<>n.code)
    OR (p.capacity IS NOT NULL AND p.capacity IS DISTINCT FROM n.capacity)
    OR (p.geographic_area_id IS NOT NULL AND p.geographic_area_id IS DISTINCT FROM n.geographic_area_id);
 IF conflicts<>0 THEN RAISE EXCEPTION 'Site mismatch: do not infer or overwrite'; END IF;
END $preflight$;
UPDATE public.sites p
 SET site_kind=COALESCE(p.site_kind,n.site_kind),
     lifecycle_status=COALESCE(p.lifecycle_status,n.status),
     reference_code=COALESCE(p.reference_code,n.code),
     capacity=COALESCE(p.capacity,n.capacity),
     geographic_area_id=COALESCE(p.geographic_area_id,n.geographic_area_id),
     updated_at=now()
 FROM education_v30.sites n
 WHERE p.id=n.id
   AND (p.site_kind IS NULL OR p.lifecycle_status IS NULL OR p.reference_code IS NULL
        OR (p.capacity IS NULL AND n.capacity IS NOT NULL)
        OR (p.geographic_area_id IS NULL AND n.geographic_area_id IS NOT NULL));
DO $verify$
DECLARE lost_rows bigint;
BEGIN
 SELECT count(*) INTO lost_rows FROM education_v30.sites n
 LEFT JOIN public.sites p ON p.id=n.id
 WHERE p.id IS NULL OR p.site_kind IS DISTINCT FROM n.site_kind
   OR p.lifecycle_status IS DISTINCT FROM n.status
   OR p.reference_code IS DISTINCT FROM n.code
   OR p.capacity IS DISTINCT FROM n.capacity
   OR p.geographic_area_id IS DISTINCT FROM n.geographic_area_id;
 IF lost_rows<>0 THEN RAISE EXCEPTION 'Native Site educational fields not preserved'; END IF;
END $verify$;
COMMIT;
