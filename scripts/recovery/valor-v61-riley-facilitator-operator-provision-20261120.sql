-- CAN OS | Valor synthetic Riley separate facilitator membership.
-- Operator-authorized SQL implementation of the exact existing
-- provisionDemoRileyFacilitator fixture for constrained Neon main execution.
-- Unlike raw grant insertion, this checks existing CAN identity, active verified
-- teacher grant and exact synthetic Site, writes audit + event in the SAME
-- transaction, and refuses to revive revoked or conflicting memberships.
-- For this active synthetic Site, also reconcile its null Organization lifecycle.\n-- This deliberately does NOT issue a user session, approve a Class staff
-- assignment, mark an email verified, or grant attendance/physical supervision.
-- Idempotent, additive, transaction-owned, and scoped to one CAN Person.
DO $valor_riley_facilitator$
DECLARE
  v_org CONSTANT uuid := 'f1000000-0000-4000-8000-000000000002';
  v_site CONSTANT uuid := 'f1000000-0000-4000-8000-000000000003';
  v_person CONSTANT uuid := 'f1000000-0000-4000-8000-000000000006';
  v_account CONSTANT uuid := 'fa000000-0000-4000-8000-000000000002';
  v_teacher_grant CONSTANT uuid := 'fb000000-0000-4000-8000-000000000002';
  v_facilitator_grant CONSTANT uuid := 'fb000000-0000-4000-8000-000000000102';
  v_role_assignment CONSTANT uuid := 'fb100000-0000-4000-8000-000000000102';
  v_email CONSTANT text := 'riley.teacher@valorschool.demo';
  v_inserted_grant uuid;
  v_inserted_role uuid;
  v_org_activated uuid;
  v_changes jsonb := '[]'::jsonb;
BEGIN
  IF current_setting('neon.project_id',true) <> 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) <> 'br-restless-sea-ar9ooo55'
    OR current_database() <> 'neondb'
  THEN
    RAISE EXCEPTION 'Expected CAN OS Neon main only';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('can-os:valor-riley-facilitator'));

  PERFORM 1 FROM public.organizations o
    WHERE o.id=v_org AND o.metadata @> '{"synthetic":true}'::jsonb
    AND (o.lifecycle_status IS NULL OR o.lifecycle_status='active') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic operating Organization is not current'; END IF;

  PERFORM 1 FROM public.sites s WHERE s.id=v_site AND
    s.organization_id=v_org AND
    s.metadata @> '{"synthetic":true}'::jsonb AND
    s.lifecycle_status IN ('planning','active') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Synthetic Valor Site is not current'; END IF;

  -- Valor's existing Site and Classes are active, but the older synthetic
  -- Organization had no lifecycle value. The restricted CAN staff projection
  -- explicitly requires 'active'. Reconcile just this synthetic Organization,
  -- without touching any real tenant or inventing an external approval.
  UPDATE public.organizations
    SET lifecycle_status='active', updated_at=clock_timestamp()
    WHERE id=v_org AND lifecycle_status IS NULL
  RETURNING id INTO v_org_activated;
  IF v_org_activated IS NOT NULL THEN
    INSERT INTO public.audit_events
      (actor_person_id,action,resource_type,resource_id,scope,before,after,context)
    VALUES (NULL,'demo.organization.lifecycle.reconciled','organization',v_org,
      jsonb_build_object('organizationId',v_org,'siteId',v_site),
      '{"lifecycleStatus":null}'::jsonb,
      '{"lifecycleStatus":"active"}'::jsonb,
      '{"method":"explicit_operator_sql_fixture_reconciliation","synthetic":true,"requestedBy":"user_in_chat","approvalEvidence":"not_inferred"}'::jsonb);
    v_changes := v_changes || '["synthetic_organization_lifecycle"]'::jsonb;
  END IF;

  PERFORM 1 FROM public.people p WHERE p.id=v_person
    AND p.active AND p.metadata @> '{"synthetic":true}'::jsonb FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riley immutable synthetic Person is not current'; END IF;

  PERFORM 1 FROM public.access_accounts a WHERE a.id=v_account
    AND a.person_id=v_person AND a.email_normalized=v_email
    AND a.disabled=false AND a.email_verified_at IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riley existing verified CAN account is not current'; END IF;

  PERFORM 1 FROM public.account_person_grants g
    WHERE g.id=v_teacher_grant AND g.account_id=v_account AND
      g.person_id=v_person AND g.organization_id=v_org AND
      g.site_id=v_site AND g.role='teacher' AND g.active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Riley active teacher grant is missing or changed'; END IF;

  -- Every grant (including inactive) for Riley's account must be from the
  -- exact allowlisted role set. A second Person or Site is a hard error.
  IF EXISTS(
    SELECT 1 FROM public.account_person_grants g
    WHERE g.account_id=v_account AND
      (g.person_id<>v_person OR g.organization_id IS DISTINCT FROM v_org OR
       g.site_id IS DISTINCT FROM v_site OR
       NOT ((g.id=v_teacher_grant AND g.role='teacher') OR
            (g.id=v_facilitator_grant AND g.role='room_facilitator')))
  ) THEN RAISE EXCEPTION 'Unexpected, unauthorized or conflicting Riley grant'; END IF;

  -- A revoked fixture is NOT silently reinstated. On reruns, the exact
  -- current grant must match; a collision elsewhere is a hard error.
  INSERT INTO public.account_person_grants
    (id,account_id,person_id,role,organization_id,site_id,active)
  VALUES
    (v_facilitator_grant,v_account,v_person,'room_facilitator',v_org,v_site,true)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_grant;

  PERFORM 1 FROM public.account_person_grants g WHERE g.id=v_facilitator_grant
    AND g.account_id=v_account AND g.person_id=v_person AND
    g.organization_id=v_org AND g.site_id=v_site AND
    g.role='room_facilitator' AND g.active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Existing facilitator grant revoked or conflicting'; END IF;

  IF v_inserted_grant IS NOT NULL THEN
    v_changes := v_changes || '["facilitator_grant"]'::jsonb;
  END IF;

  INSERT INTO public.role_assignments
    (id,person_id,organization_id,site_id,program_id,
     role_key,capabilities,metadata)
  VALUES (v_role_assignment,v_person,v_org,v_site,NULL,
    'room_facilitator','["learning.room.facilitate"]'::jsonb,
    '{"synthetic":true,"source":"operator-bootstrap-valor-riley-classroom-connect"}'::jsonb)
  ON CONFLICT (id) DO NOTHING
  RETURNING id INTO v_inserted_role;

  PERFORM 1 FROM public.role_assignments r
    WHERE r.id=v_role_assignment AND r.person_id=v_person AND
      r.organization_id=v_org AND r.site_id=v_site AND
      r.program_id IS NULL AND r.role_key='room_facilitator' AND
      r.capabilities='["learning.room.facilitate"]'::jsonb AND
      r.metadata @> '{"synthetic":true,"source":"operator-bootstrap-valor-riley-classroom-connect"}'::jsonb
      AND NOT (r.metadata ? 'revokedAt') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Institutional fixture conflict or revocation'; END IF;
  IF v_inserted_role IS NOT NULL THEN
    v_changes := v_changes || '["institutional_facilitator_role"]'::jsonb;
  END IF;

  -- These are actual operation logs of a user-authorized synthetic fixture
  -- write, not a claimed manager or safeguarding approval.
  IF jsonb_array_length(v_changes)>0 THEN
    INSERT INTO public.audit_events
      (actor_person_id,action,resource_type,resource_id,scope,after,context)
    VALUES (NULL,'demo.room_facilitator.provision','person',v_person,
      jsonb_build_object('organizationId',v_org,'siteId',v_site),
      jsonb_build_object('changes',v_changes,'role','room_facilitator',
        'grantId',v_facilitator_grant,
        'roleAssignmentId',v_role_assignment,
        'capabilities',jsonb_build_array('learning.room.facilitate')),
      '{"method":"explicit_operator_sql_provisioning","synthetic":true,"requestedBy":"user_in_chat","classStaffAssignment":"not_approved_by_provisioning","session":"not_created"}'::jsonb);
    INSERT INTO public.domain_events
      (event_type,aggregate_type,aggregate_id,actor_person_id,payload)
    VALUES ('DemoRoomFacilitatorProvisioned','person',v_person,NULL,
      jsonb_build_object('changes',v_changes,'grantId',v_facilitator_grant,
        'roleAssignmentId',v_role_assignment,'synthetic',true,
        'organizationId',v_org,'siteId',v_site));
  END IF;
END $valor_riley_facilitator$;
