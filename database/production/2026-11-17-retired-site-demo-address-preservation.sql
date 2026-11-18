-- Preserve the verified synthetic address metadata on the one retired demo Site.
-- The old education_v30.sites row had {"synthetic":true,"addressVerified":false}
-- while the authoritative public.sites.address was NULL at retirement.
-- Never overwrite an address supplied by a user or an operator.
DO $check$
BEGIN
  IF current_setting('neon.project_id',true) <> 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) <> 'br-restless-sea-ar9ooo55'
    OR to_regclass('education_v30.sites') IS NOT NULL THEN
    RAISE EXCEPTION 'Site address preservation requires completed Neon main retirement';
  END IF;
END $check$;
UPDATE public.sites
SET address='{"synthetic":true,"addressVerified":false}'::jsonb,
    updated_at=clock_timestamp()
WHERE id='ca270000-0000-4000-8000-000000000002'::uuid
  AND reference_code='CLC-DEMO-01'
  AND lifecycle_status='planning'
  AND name='CAN Community Learning Center (Demo)'
  AND address IS NULL;
