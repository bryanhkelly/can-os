-- CAN OS main: preserve explicit canonical Organization attributes directly
-- on the existing public Organization with the SAME UUID and display name.
-- No bridge, new Organization, guessed name match, or external registry write.
-- Synthetic demo legal name and reference remain labeled synthetic.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE conflicts integer; count_rows integer;
BEGIN
 IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
   OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
 THEN RAISE EXCEPTION 'Not CAN OS production main'; END IF;
 SELECT count(*) INTO count_rows FROM education_v30.organizations;
 IF count_rows<>1 THEN RAISE EXCEPTION 'Native Organization row count changed'; END IF;
 SELECT count(*) INTO conflicts
 FROM education_v30.organizations n LEFT JOIN public.organizations p ON p.id=n.id
 WHERE p.id IS NULL OR p.name<>n.display_name OR
   (p.lifecycle_status IS NOT NULL AND p.lifecycle_status<>n.status) OR
   (p.external_reference IS NOT NULL AND p.external_reference IS DISTINCT FROM n.external_reference) OR
   (p.legal_name IS NOT NULL AND p.legal_name IS DISTINCT FROM n.legal_name);
 IF conflicts<>0 THEN RAISE EXCEPTION 'Organization ID or fields conflict: no automatic mapping'; END IF;
END $preflight$;
UPDATE public.organizations p
 SET lifecycle_status=COALESCE(p.lifecycle_status,n.status),
     external_reference=COALESCE(p.external_reference,n.external_reference),
     legal_name=COALESCE(p.legal_name,n.legal_name),
     updated_at=now()
 FROM education_v30.organizations n
 WHERE p.id=n.id
   AND (p.lifecycle_status IS NULL OR p.external_reference IS NULL OR p.legal_name IS NULL);
DO $verify$
DECLARE incomplete integer;
BEGIN
 SELECT count(*) INTO incomplete
 FROM education_v30.organizations n LEFT JOIN public.organizations p ON p.id=n.id
 WHERE p.id IS NULL OR p.lifecycle_status IS DISTINCT FROM n.status OR
   p.external_reference IS DISTINCT FROM n.external_reference OR
   p.legal_name IS DISTINCT FROM n.legal_name;
 IF incomplete<>0 THEN RAISE EXCEPTION 'Organization attributes were not retained'; END IF;
END $verify$;
COMMIT;
