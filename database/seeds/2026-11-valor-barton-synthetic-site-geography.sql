-- V6.1 TEST BRANCH ONLY. Existing synthetic Valor/Barton Site addresses
-- explicitly state US/CA. This links only those two canonical public Sites
-- to the existing US-CA reference for non-school Program planning.
-- The status remains 'unverified_qa': no real premises were geocoded or
-- verified and no school, qualification, publication or enrollment grant
-- is created. Run in one transaction on a disposable validation branch.
--
-- Before using this seed: independently confirm the Neon branch is
-- br-bitter-pine-ar7mjn70. Do not apply to Neon main.
DO $verify_qa_site_geography$
BEGIN
  IF (SELECT count(*) FROM public.sites
      WHERE id IN (
        'f1000000-0000-4000-8000-000000000003'::uuid,
        'd8082b23-b28c-454d-a144-6860ef19d9ea'::uuid
      ) AND metadata->>'synthetic'='true'
        AND address->>'country'='US'
        AND address->>'state'='CA'
        AND geographic_area_id IS NULL
        AND lifecycle_status IS NULL) <> 2
  THEN
    RAISE EXCEPTION 'Synthetic Valor/Barton geography preconditions changed';
  END IF;
  IF (SELECT count(*) FROM public.geographic_areas
      WHERE code='US-CA' AND name='California' AND level_code='state') <> 1
  THEN
    RAISE EXCEPTION 'Canonical California reference is missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.program_site_authorizations psa
    WHERE psa.site_id IN (
      'f1000000-0000-4000-8000-000000000003'::uuid,
      'd8082b23-b28c-454d-a144-6860ef19d9ea'::uuid
    ) AND psa.status='approved'
  ) THEN
    RAISE EXCEPTION 'Unexpected independently approved Site Program authority';
  END IF;
END $verify_qa_site_geography$;

UPDATE public.sites
SET geographic_area_id = (SELECT id FROM public.geographic_areas
                          WHERE code='US-CA' AND level_code='state'),
    lifecycle_status='planning',
    metadata = metadata || jsonb_build_object(
      'geographicClassification',
      jsonb_build_object(
        'scope','state',
        'referenceCode','US-CA',
        'source','existing_synthetic_site_address',
        'reviewStatus','unverified_qa',
        'schoolOpeningApproved',false
      )
    )
WHERE id IN (
  'f1000000-0000-4000-8000-000000000003'::uuid,
  'd8082b23-b28c-454d-a144-6860ef19d9ea'::uuid
)
  AND metadata->>'synthetic'='true'
  AND address->>'country'='US'
  AND address->>'state'='CA'
  AND geographic_area_id IS NULL
  AND lifecycle_status IS NULL;

INSERT INTO public.audit_events
  (actor_person_id, action, resource_type, resource_id, scope, context)
SELECT NULL,
  'site.qa_geographic_classification',
  'site',
  s.id,
  jsonb_build_object('siteId',s.id,'organizationId',s.organization_id),
  jsonb_build_object(
    'reason','v61_synthetic_community_program_site_test',
    'source','existing_synthetic_site_address',
    'referenceCode','US-CA',
    'reviewStatus','unverified_qa',
    'schoolOpeningApproved',false
  )
FROM public.sites s
WHERE s.id IN (
  'f1000000-0000-4000-8000-000000000003'::uuid,
  'd8082b23-b28c-454d-a144-6860ef19d9ea'::uuid
)
  AND s.metadata->'geographicClassification'->>'reviewStatus'='unverified_qa'
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_events a
    WHERE a.action='site.qa_geographic_classification'
      AND a.resource_type='site' AND a.resource_id=s.id
  );
