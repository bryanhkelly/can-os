-- CAN OS V6.1 one-time synthetic fixture reconciliation, not runtime policy.
-- Old Valor institutional facilitator profile retained onsite permissions.
-- The standard room_facilitator role now conveys ONLY learning.room.facilitate.
-- Do not verify Sally, activate her suspended Class role, or issue a session.
DO $reconcile$
DECLARE
  old_capabilities constant jsonb := '["safeguarding.concern.submit","onsite.attendance.record","onsite.pickup.release","profiles.credentials.submit"]'::jsonb;
  new_capabilities constant jsonb := '["learning.room.facilitate"]'::jsonb;
  valor_org constant uuid := 'f1000000-0000-4000-8000-000000000002';
  valor_site constant uuid := 'f1000000-0000-4000-8000-000000000003';
  sally_person constant uuid := 'f7200000-0000-4000-8000-000000000001';
  fixture_role constant uuid := 'f7200000-0000-4000-8000-000000000005';
  before_value jsonb;
BEGIN
  IF current_setting('neon.project_id',true)<>'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true)<>'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Not CAN OS Neon main'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('can-os:valor-facilitator-standard-role'));
  IF NOT EXISTS(
    SELECT 1 FROM public.sites s JOIN public.organizations o ON o.id=s.organization_id
    WHERE s.id=valor_site AND s.organization_id=valor_org
      AND s.metadata @> '{"synthetic":true}'::jsonb
      AND o.metadata @> '{"synthetic":true}'::jsonb
  ) THEN RAISE EXCEPTION 'Valor site baseline changed'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.access_accounts a
    WHERE a.email_normalized='sally.facilitator@valorschool.demo'
      AND a.person_id=sally_person AND a.email_verified_at IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM public.class_staff_assignments sa
    JOIN public.classes c ON c.id=sa.class_id
    WHERE sa.person_id=sally_person AND c.site_id=valor_site
      AND sa.state='suspended'
  ) THEN RAISE EXCEPTION 'Sally negative authorization fixture changed'; END IF;

  SELECT r.capabilities INTO STRICT before_value
  FROM public.role_assignments r
  WHERE r.id=fixture_role AND r.person_id=sally_person
    AND r.organization_id=valor_org AND r.site_id=valor_site
    AND r.role_key='room_facilitator' AND r.program_id IS NULL
    AND r.metadata @> '{"synthetic":true}'::jsonb FOR UPDATE;
  IF before_value NOT IN (old_capabilities,new_capabilities) THEN
    RAISE EXCEPTION 'Unexpected institutional facilitator capabilities'; END IF;
  IF before_value=old_capabilities THEN
    UPDATE public.role_assignments SET capabilities=new_capabilities,
      updated_at=clock_timestamp() WHERE id=fixture_role;
    INSERT INTO public.audit_events(
      actor_person_id,action,resource_type,resource_id,scope,before,after,context)
    VALUES(NULL,'staff.facilitator_capability_profile.reconciled','role_assignment',fixture_role,
      jsonb_build_object('organizationId',valor_org,'siteId',valor_site),
      jsonb_build_object('capabilities',before_value),
      jsonb_build_object('capabilities',new_capabilities),
      '{"source":"one_time_standard_role_data_reconciliation","syntheticFixture":true,"doesNotApproveStaff":true}'::jsonb);
  END IF;
END $reconcile$;
