-- P0: Remove the duplicate education_v30 Site, with one public.sites authority.
-- Main only. This file is a guarded, all-or-nothing transaction. No CASCADE.
-- All surviving exact-UUID references retain their validated FK and ON DELETE semantics.
-- Direct client table access is denied; privileged server commands still require authorization.
BEGIN;

-- CAN_SQL_STEP 1
SET LOCAL lock_timeout = '5s';

-- CAN_SQL_STEP 2
SET LOCAL statement_timeout = '120s';

-- CAN_SQL_STEP 3
DO $site_guard$
DECLARE
  duplicate_sites integer;
  expected_pairs integer;
  orphans bigint;
  record_row record;
BEGIN
  IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
    RAISE EXCEPTION 'Refusing a database other than CAN OS Neon main';
  END IF;
  IF to_regclass('education_v30.sites') IS NULL OR to_regclass('public.sites') IS NULL THEN
    RAISE EXCEPTION 'Expected duplicate and authoritative Site tables for cutover';
  END IF;
  SELECT count(*) INTO duplicate_sites FROM education_v30.sites;
  IF duplicate_sites<>1 THEN RAISE EXCEPTION 'Unexpected duplicate Site count: %',duplicate_sites; END IF;
  IF EXISTS(
    SELECT 1 FROM education_v30.sites n
    WHERE NOT EXISTS(SELECT 1 FROM public.sites p WHERE p.id=n.id)
  ) THEN RAISE EXCEPTION 'Duplicate Site is not backed by exact public UUID'; END IF;
  IF EXISTS(
    SELECT 1 FROM pg_constraint c
    WHERE c.contype='f' AND c.confrelid='education_v30.sites'::regclass
  ) THEN RAISE EXCEPTION 'Native Site foreign keys remain; do not drop duplicate'; END IF;

  WITH expected (source_table,fk_name,site_column) AS (
    VALUES
    ("education_v30.application_principal_grants","application_principal_grants_site_id_fkey","site_id"),
    ("education_v30.assurance_cases","assurance_cases_site_id_fkey","site_id"),
    ("education_v30.canonical_account_grants","canonical_account_grants_site_id_fkey","site_id"),
    ("education_v30.class_enrollment_approval_requests","class_enrollment_approval_requests_site_id_fkey","site_id"),
    ("education_v30.class_enrollment_invitations","class_enrollment_invitations_site_id_fkey","site_id"),
    ("education_v30.classes","classes_site_id_fkey","site_id"),
    ("education_v30.connectivity_services","connectivity_services_site_id_fkey","site_id"),
    ("education_v30.control_obligations","control_obligations_site_id_fkey","site_id"),
    ("education_v30.deployment_sites","deployment_sites_site_id_fkey","site_id"),
    ("education_v30.education_operation_sites","education_operation_sites_site_id_fkey","site_id"),
    ("education_v30.equipment_assignments","equipment_assignments_site_id_fkey","site_id"),
    ("education_v30.equipment_custody_events","equipment_custody_events_from_site_id_fkey","from_site_id"),
    ("education_v30.equipment_custody_events","equipment_custody_events_to_site_id_fkey","to_site_id"),
    ("education_v30.evaluation_basis_dependencies","evaluation_basis_dependencies_site_id_fkey","site_id"),
    ("education_v30.facilitated_classroom_plans","facilitated_classroom_plans_site_id_fkey","site_id"),
    ("education_v30.facilitated_learning_sessions","facilitated_learning_sessions_site_id_fkey","site_id"),
    ("education_v30.facilitated_rehearsal_events","facilitated_rehearsal_events_site_id_fkey","site_id"),
    ("education_v30.feedback_subjects","feedback_subjects_site_id_fkey","site_id"),
    ("education_v30.governance_policy_scopes","governance_policy_scopes_site_id_fkey","site_id"),
    ("education_v30.learning_completion_evidence_bindings","learning_completion_evidence_bindings_delivery_site_id_fkey","delivery_site_id"),
    ("education_v30.learning_completion_evidence_review_requests","learning_completion_evidence_review_reque_delivery_site_id_fkey","delivery_site_id"),
    ("education_v30.metric_observations","metric_observations_site_id_fkey","site_id"),
    ("education_v30.noncredit_self_enrollment_claims","noncredit_self_enrollment_claims_site_id_fkey","site_id"),
    ("education_v30.noncredit_self_enrollment_releases","noncredit_self_enrollment_releases_site_id_fkey","site_id"),
    ("education_v30.official_authorization_scopes","official_authorization_scopes_site_id_fkey","site_id"),
    ("education_v30.operational_authorization_decisions","operational_authorization_decisions_site_id_fkey","site_id"),
    ("education_v30.operator_rollout_applications","operator_rollout_applications_site_id_fkey","site_id"),
    ("education_v30.participation_attributions","participation_attributions_delivery_site_id_fkey","delivery_site_id"),
    ("education_v30.participation_attributions","participation_attributions_reporting_site_id_fkey","reporting_site_id"),
    ("education_v30.qualification_proposed_sites","qualification_proposed_sites_linked_site_id_fkey","linked_site_id"),
    ("education_v30.qualification_subjects","qualification_subjects_site_id_fkey","site_id"),
    ("education_v30.quality_evaluations","quality_evaluations_subject_site_id_fkey","subject_site_id"),
    ("education_v30.shared_resource_pools","shared_resource_pools_site_id_fkey","site_id"),
    ("education_v30.site_device_policies","site_device_policies_site_id_fkey","site_id"),
    ("education_v30.site_device_registrations","site_device_registrations_site_id_fkey","site_id"),
    ("education_v30.site_organization_roles","site_organization_roles_site_id_fkey","site_id"),
    ("education_v30.site_publication_bindings","site_publication_bindings_site_id_fkey","site_id"),
    ("education_v30.site_spaces","site_spaces_site_id_fkey","site_id"),
    ("education_v30.survey_campaigns","survey_campaigns_site_id_fkey","site_id"),
    ("education_v30.technology_readiness_evaluations","technology_readiness_evaluations_site_id_fkey","site_id")
  ),
  matching AS (
    SELECT e.source_table,e.fk_name,e.site_column,c.oid,c.convalidated
    FROM expected e
    LEFT JOIN pg_constraint c ON c.conname=e.fk_name
      AND c.conrelid=to_regclass(e.source_table)
      AND c.confrelid='public.sites'::regclass AND c.contype='f'
    LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attname=e.site_column
    WHERE c.oid IS NOT NULL AND c.convalidated
      AND cardinality(c.conkey)=1 AND c.conkey[1]=a.attnum
  )
  SELECT count(*) INTO expected_pairs FROM matching;
  IF expected_pairs<>40 THEN RAISE EXCEPTION 'Expected 40 named validated public Site FKs, found %',expected_pairs; END IF;

  FOR record_row IN
    SELECT n.nspname AS sch,t.relname AS tbl,a.attname AS col
    FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=c.conkey[1]
    WHERE c.contype='f' AND c.confrelid='public.sites'::regclass
      AND n.nspname='education_v30'
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM %I.%I child WHERE child.%I IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.sites s WHERE s.id=child.%I)',
      record_row.sch,record_row.tbl,record_row.col,record_row.col
    ) INTO orphans;
    IF orphans<>0 THEN RAISE EXCEPTION 'Orphaned Site FK in %.%: %',record_row.sch,record_row.tbl,orphans; END IF;
  END LOOP;
END $site_guard$;

-- CAN_SQL_STEP 4
UPDATE public.sites p SET
  site_kind=COALESCE(p.site_kind,n.site_kind),
  lifecycle_status=COALESCE(p.lifecycle_status,n.status),
  reference_code=COALESCE(p.reference_code,n.code),
  geographic_area_id=COALESCE(p.geographic_area_id,n.geographic_area_id),
  capacity=COALESCE(p.capacity,n.capacity),
  address=CASE WHEN p.address='{}'::jsonb AND n.address<>'{}'::jsonb THEN n.address ELSE p.address END,
  updated_at=clock_timestamp()
FROM education_v30.sites n WHERE p.id=n.id;

-- CAN_SQL_STEP 5
-- FKs already individually rebound to public.sites and validated by the guard.
-- No additional DDL or duplicate identity relation is introduced.;

-- CAN_SQL_STEP 6
CREATE OR REPLACE FUNCTION education_v30.v292_guard_fit_assessment()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE v record; a record; s record; target_offering uuid; actual_geography uuid; target_operation uuid;
BEGIN
 SELECT * INTO v FROM qualification_program_fit_policy_versions WHERE id=NEW.policy_version_id;
 SELECT * INTO a FROM qualification_applications WHERE id=NEW.base_application_id;
 SELECT * INTO s FROM qualification_subjects WHERE id=NEW.subject_id;
 IF v.lifecycle<>'published' OR EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
    WHERE w.policy_version_id=v.id AND w.effective_at<=NEW.assessed_at)
  OR a.status NOT IN ('submitted','closed')
    OR a.subject_id IS DISTINCT FROM NEW.subject_id THEN
   RAISE EXCEPTION 'Fit assessment needs a published policy and submitted application for the same subject'; END IF;
 IF NEW.participant_population<>'unknown' AND NOT EXISTS(
   SELECT 1 FROM evidence_document_versions ev
   WHERE ev.id=NEW.population_evidence_version_id AND ev.verified_at IS NOT NULL
      AND ev.verified_by_person_id IS NOT NULL
      AND (ev.valid_through IS NULL OR ev.valid_through>=NEW.assessed_at::date)) THEN
   RAISE EXCEPTION 'Known participant population requires independently verified evidence'; END IF;
 IF v.intended_population<>'any' AND NEW.participant_population NOT IN ('unknown',v.intended_population) THEN
   RAISE EXCEPTION 'Participant population is not served by this published fit policy'; END IF;
 IF v.delivery_context IS NOT NULL AND v.delivery_context<>NEW.delivery_context THEN
   RAISE EXCEPTION 'Delivery context does not match fit policy'; END IF;
 IF v.intended_population<>'any' AND a.intended_population<>'any' AND a.intended_population<>v.intended_population
    AND NOT (v.intended_population='minors' AND a.intended_population='mixed')
    AND NOT (v.intended_population='adults' AND a.intended_population='mixed') THEN
   RAISE EXCEPTION 'Intended participant population is not covered by fit policy'; END IF;
 -- A live site's known geography cannot be misrepresented in a program-fit assessment.
 IF s.site_id IS NOT NULL THEN
   SELECT geographic_area_id INTO actual_geography FROM public.sites WHERE id=s.site_id;
   IF actual_geography IS NOT NULL AND NEW.geographic_area_id IS DISTINCT FROM actual_geography THEN
     RAISE EXCEPTION 'Fit assessment geography must match the established site'; END IF;
 END IF;
 IF NEW.deployment_id IS NOT NULL THEN
   SELECT offering_id,operation_id INTO target_offering,target_operation FROM program_deployments
     WHERE id=NEW.deployment_id;
   IF NOT EXISTS(SELECT 1 FROM education_operation_organization_roles role
     WHERE role.operation_id=target_operation AND role.organization_id=s.applicant_organization_id
       AND role.role_code IN ('operator','host','contract_holder','academic_provider')
       AND role.status='approved' AND role.valid_from<=NEW.assessed_at
       AND (role.valid_through IS NULL OR role.valid_through>NEW.assessed_at)) THEN
     RAISE EXCEPTION 'Assessed deployment is not under an authorized applicant operation role'; END IF;
   IF v.offering_version_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM offering_versions ov WHERE ov.id=v.offering_version_id AND ov.offering_id=target_offering) THEN
     RAISE EXCEPTION 'Selected deployment does not deliver the policy offering'; END IF;
 END IF;
 RETURN NEW;
END $function$
;

-- CAN_SQL_STEP 7
CREATE OR REPLACE FUNCTION education_v30.v292_program_fit_recommendation(target_assessment uuid)
 RETURNS TABLE(recommended_outcome text, required_total integer, satisfied_count integer, deficiency_count integer, verification_count integer, availability text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE a record; req record; r record; catalog record; source_version uuid;
        site_capacity integer; capacity_confirmed boolean := false;
        blocked boolean := false; resources boolean := false;
        outstanding boolean := false; relevant boolean; population_unknown boolean;
BEGIN
 SELECT * INTO a FROM qualification_program_fit_assessments WHERE id=target_assessment;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown program-fit assessment'; END IF;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_version_withdrawals w
    WHERE w.policy_version_id=a.policy_version_id AND w.effective_at<=CURRENT_TIMESTAMP) THEN
   recommended_outcome:='not_recommended';required_total:=0;satisfied_count:=0;
   deficiency_count:=0;verification_count:=0;availability:='unavailable';RETURN NEXT;RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM qualification_program_fit_policy_requirements p
     JOIN qualification_requirements q ON q.id=p.qualification_requirement_id
     JOIN qualification_template_withdrawals w ON w.definition_version_id=q.definition_version_id
     WHERE p.policy_version_id=a.policy_version_id AND p.source_kind='qualification_requirement'
       AND w.effective_at<=CURRENT_TIMESTAMP) THEN blocked:=true; END IF;
 SELECT * INTO catalog FROM v30_catalog_program_availability(a.geographic_area_id,a.delivery_context) c
  WHERE c.policy_version_id=a.policy_version_id LIMIT 1;
 availability:=CASE COALESCE(catalog.catalog_status,'review_required')
   WHEN 'supported' THEN 'possible' WHEN 'review_required' THEN 'requires_research'
   ELSE catalog.catalog_status END;
 required_total:=0;satisfied_count:=0;deficiency_count:=0;verification_count:=0;
 population_unknown:=a.participant_population='unknown' OR NOT EXISTS(
  SELECT 1 FROM evidence_document_versions ev
  WHERE ev.id=a.population_evidence_version_id AND ev.verified_at IS NOT NULL
   AND ev.verified_by_person_id IS NOT NULL
   AND (ev.valid_through IS NULL OR ev.valid_through>=CURRENT_DATE));
 IF population_unknown THEN outstanding:=true;verification_count:=verification_count+1; END IF;
 FOR req IN SELECT * FROM qualification_program_fit_policy_requirements p
   WHERE p.policy_version_id=a.policy_version_id AND p.importance IN ('blocking','required')
 LOOP
  relevant:=req.audience='any' OR population_unknown OR a.participant_population='mixed'
   OR (req.audience='minors' AND a.participant_population='minors')
   OR (req.audience='adults' AND a.participant_population='adults');
  IF NOT relevant THEN CONTINUE; END IF;
  required_total:=required_total+1;
  IF population_unknown AND req.audience<>'any' THEN
   outstanding:=true;verification_count:=verification_count+1;CONTINUE;
  END IF;
  SELECT * INTO r FROM qualification_program_fit_requirement_results result
    WHERE result.assessment_id=a.id AND result.policy_requirement_id=req.id
    ORDER BY result.result_order DESC LIMIT 1;
  IF req.minimum_quantity IS NOT NULL AND req.resource_kind IS NOT NULL
   AND NOT EXISTS(SELECT 1 FROM qualification_resource_needs need
      WHERE need.assessment_id=a.id AND need.policy_requirement_id=req.id
        AND need.required_quantity>=req.minimum_quantity AND need.status<>'cancelled') THEN
     outstanding:=true;verification_count:=verification_count+1;
  END IF;
  IF r.id IS NULL OR r.determination='pending' THEN
   outstanding:=true;verification_count:=verification_count+1;
  ELSIF r.determination='not_applicable' THEN
   IF req.importance='blocking' THEN blocked:=true;deficiency_count:=deficiency_count+1;
   ELSE outstanding:=true;verification_count:=verification_count+1; END IF;
  ELSIF r.determination='deficient' THEN
   deficiency_count:=deficiency_count+1;
   IF req.importance='blocking' THEN blocked:=true;
   ELSIF req.resource_kind IS NOT NULL THEN resources:=true;
   ELSE outstanding:=true; END IF;
  ELSIF r.determination='satisfied' THEN
   IF req.evidence_standard<>'self_report' AND r.verification_level<>'verified' THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSIF req.source_kind='qualification_requirement' AND NOT EXISTS(
      SELECT 1 FROM qualification_requirement_evaluations e
      JOIN qualification_applications qa ON qa.id=e.application_id
      WHERE e.id=r.source_qualification_evaluation_id AND qa.status IN ('submitted','closed')
       AND e.determination='satisfied' AND
       (e.valid_through IS NULL OR e.valid_through>CURRENT_TIMESTAMP)
       AND NOT EXISTS(SELECT 1 FROM qualification_requirement_evaluations later
         WHERE later.supersedes_id=e.id)) THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSIF req.source_kind='site_capability' AND NOT EXISTS(
      SELECT 1 FROM site_space_capability_verifications fv
      WHERE fv.id=r.source_facility_verification_id AND fv.result='verified'
       AND (fv.expires_at IS NULL OR fv.expires_at>CURRENT_TIMESTAMP)) THEN
    outstanding:=true;verification_count:=verification_count+1;
   ELSE satisfied_count:=satisfied_count+1;
   END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM qualification_resource_need_estimates n
   WHERE n.assessment_id=a.id AND n.remaining_unmet_quantity>0) THEN resources:=true; END IF;
 -- A remote-only course does not need a local room count or physical-facility review.
 IF a.delivery_context IN ('onsite','hybrid') THEN
  SELECT s.capacity,(s.capacity IS NOT NULL) INTO site_capacity,capacity_confirmed FROM qualification_subjects sub
  JOIN public.sites s ON s.id=sub.site_id WHERE sub.id=a.subject_id;
  IF NOT FOUND THEN
   SELECT p.verified_seating_capacity,(p.verified_seating_capacity IS NOT NULL) INTO site_capacity,capacity_confirmed
    FROM qualification_subjects sub JOIN qualification_proposed_sites p ON p.id=sub.proposed_site_id
    WHERE sub.id=a.subject_id;
   IF NOT FOUND OR NOT capacity_confirmed THEN outstanding:=true;verification_count:=verification_count+1; END IF;
  END IF;
  IF NOT capacity_confirmed THEN outstanding:=true;verification_count:=verification_count+1; END IF;
  IF a.expected_concurrent_learners IS NOT NULL AND site_capacity IS NOT NULL
    AND a.expected_concurrent_learners>site_capacity THEN resources:=true; END IF;
 END IF;
 IF availability='unavailable' OR blocked THEN recommended_outcome:='not_recommended';
 ELSIF availability IN ('requires_research','conditional','review_required') THEN
    recommended_outcome:='needs_verification';
 ELSIF outstanding THEN recommended_outcome:='needs_verification';
 ELSIF resources THEN recommended_outcome:='needs_resources';
 ELSE recommended_outcome:='candidate'; END IF;
 RETURN NEXT;
END $function$
;

-- CAN_SQL_STEP 8
CREATE OR REPLACE FUNCTION education_v30.v30_dependency_current_fingerprint(d education_v30.evaluation_basis_dependencies)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE payload text;
BEGIN
 IF d.site_id IS NOT NULL THEN
  SELECT to_jsonb(s)::text INTO payload FROM public.sites s WHERE s.id=d.site_id;
 ELSIF d.evidence_version_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM evidence_document_versions v WHERE v.id=d.evidence_version_id;
 ELSIF d.fit_policy_version_id IS NOT NULL THEN
  SELECT concat(to_jsonb(v)::text,'|',coalesce(to_jsonb(w)::text,'')) INTO payload
  FROM qualification_program_fit_policy_versions v
  LEFT JOIN qualification_program_fit_policy_version_withdrawals w ON w.policy_version_id=v.id
  WHERE v.id=d.fit_policy_version_id;
 ELSIF d.qualification_definition_version_id IS NOT NULL THEN
  SELECT concat(to_jsonb(v)::text,'|',coalesce((SELECT string_agg(to_jsonb(w)::text,';')
    FROM qualification_template_withdrawals w WHERE w.definition_version_id=v.id),'')) INTO payload
  FROM qualification_definition_versions v WHERE v.id=d.qualification_definition_version_id;
 ELSIF d.screening_decision_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM professional_screening_decisions v WHERE v.id=d.screening_decision_id;
 ELSIF d.facility_verification_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM site_space_capability_verifications v WHERE v.id=d.facility_verification_id;
 ELSIF d.resource_need_id IS NOT NULL THEN
  SELECT to_jsonb(v)::text INTO payload FROM qualification_resource_need_estimates v WHERE v.resource_need_id=d.resource_need_id;
 END IF;
 IF payload IS NULL THEN RETURN NULL; END IF;
 RETURN encode(public.digest(payload,'sha256'),'hex');
END $function$
;

-- CAN_SQL_STEP 9
CREATE OR REPLACE FUNCTION education_v30.v301_can_staff_session_context(p_can_session_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  WITH source_session AS MATERIALIZED (
    SELECT
      a.id AS can_account_id,
      s.id AS can_session_id,
      g.person_id AS can_person_id,
      g.organization_id AS can_organization_id,
      g.site_id AS can_site_id,
      g.role AS can_role
    FROM public.access_sessions s
    JOIN public.access_accounts a
      ON a.id = s.account_id
    JOIN public.account_person_grants g
      ON g.id = s.active_grant_id AND g.account_id = a.id
    JOIN public.people person
      ON person.id = g.person_id
    JOIN public.sites school_site
      ON school_site.id = g.site_id
      AND school_site.organization_id = g.organization_id
    WHERE s.secret_hash = p_can_session_hash
      AND length(p_can_session_hash) = 64
      AND s.revoked_at IS NULL
      AND s.expires_at > clock_timestamp()
      AND s.updated_at > clock_timestamp() - interval '30 minutes'
      AND (NOT s.shared_device OR
        s.last_activity_at > clock_timestamp() - interval '5 minutes')
      AND a.disabled = false
      AND a.email_verified_at IS NOT NULL
      AND lower(a.email_normalized) NOT LIKE '%.demo'
      AND person.active = true
      AND g.active = true
      AND g.role IN ('site_admin', 'registrar')
      AND g.site_id IS NOT NULL
      AND g.organization_id IS NOT NULL
      -- A real shared account with different Persons cannot select a
      -- second Person simply by switching the active role.
      AND NOT EXISTS (
        SELECT 1 FROM public.account_person_grants other_grant
        WHERE other_grant.account_id = a.id
          AND other_grant.active = true
          AND other_grant.person_id <> g.person_id
      )
  )
  SELECT native_account.id, source.can_session_id, native_grant.id,
    native_grant.person_id, native_grant.role_code,
    native_grant.organization_id, native_grant.site_id
  FROM source_session source
  JOIN public.access_account_canonical_principals person_link
    ON person_link.account_id = source.can_account_id
      AND person_link.revoked_at IS NULL
      AND person_link.verified_at IS NOT NULL
      AND person_link.verified_by_account_id <> source.can_account_id
  JOIN education_v30.canonical_account_grants native_grant
    ON native_grant.person_id = person_link.canonical_principal_id
      AND native_grant.site_id = source.can_site_id
      AND native_grant.role_code = source.can_role
      AND native_grant.active = true
      AND native_grant.revoked_at IS NULL
  JOIN education_v30.canonical_accounts native_account
    ON native_account.id = native_grant.account_id
      AND native_account.email_verified_at IS NOT NULL
      AND native_account.disabled_at IS NULL
  JOIN education_v30.organizations native_org
    ON native_org.id = native_grant.organization_id
      AND native_org.status = 'active'
  JOIN public.sites native_site
    ON native_site.id = source.can_site_id
      AND native_site.lifecycle_status IN ('planning', 'active')
  WHERE EXISTS (
    SELECT 1 FROM education_v30.site_organization_roles operator_role
    WHERE operator_role.organization_id = native_grant.organization_id
      AND operator_role.site_id = native_grant.site_id
      AND operator_role.role_code IN ('operator', 'host')
      AND operator_role.valid_from <= clock_timestamp()
      AND (operator_role.valid_through IS NULL
        OR operator_role.valid_through > clock_timestamp())
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.access_account_canonical_principals other_link
    WHERE other_link.canonical_principal_id = person_link.canonical_principal_id
      AND other_link.account_id <> source.can_account_id
      AND other_link.revoked_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.access_account_canonical_principals other_link
    WHERE other_link.account_id = source.can_account_id
      AND other_link.canonical_principal_id <> person_link.canonical_principal_id
      AND other_link.revoked_at IS NULL
  );
$function$
;

-- CAN_SQL_STEP 10
CREATE OR REPLACE FUNCTION education_v30.v301_canonical_session_context(p_secret_hash text)
 RETURNS TABLE(account_id uuid, session_id uuid, grant_id uuid, person_id uuid, role_code text, organization_id uuid, site_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'education_v30', 'pg_catalog', 'pg_temp'
AS $function$
 SELECT a.id, s.id, g.id, g.person_id, g.role_code, g.organization_id, g.site_id
 FROM canonical_sessions s
 JOIN canonical_accounts a ON a.id=s.account_id
 JOIN canonical_account_grants g ON g.id=s.active_grant_id AND g.account_id=a.id
 JOIN organizations o ON o.id=g.organization_id
 WHERE s.secret_hash=p_secret_hash
   AND a.email_verified_at IS NOT NULL AND a.disabled_at IS NULL
   AND g.active AND g.revoked_at IS NULL
   AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
   AND s.last_activity_at>clock_timestamp()-interval '30 minutes'
   AND o.status='active'
   AND (
      (g.role_code IN ('blueprint_reviewer','survey_reviewer','learner') AND g.site_id IS NULL)
      OR (g.role_code IN ('site_admin','registrar','room_facilitator') AND EXISTS (
        SELECT 1 FROM site_organization_roles sor
        JOIN public.sites st ON st.id=sor.site_id
        WHERE sor.site_id=g.site_id AND sor.organization_id=g.organization_id
          AND sor.role_code='operator' AND sor.valid_from<=clock_timestamp()
          AND (sor.valid_through IS NULL OR sor.valid_through>clock_timestamp())
          AND st.lifecycle_status IN ('planning','active')))
   )
$function$
;

-- CAN_SQL_STEP 11
CREATE OR REPLACE FUNCTION education_v30.v301_public_site_claims(requested_slug text)
 RETURNS TABLE(site_id uuid, site_name text, operation_id uuid, program_claim_kind text, display_text text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'education_v30', 'pg_temp'
AS $function$
 SELECT DISTINCT s.id,s.name,c.operation_id,c.program_claim_kind,c.display_text,c.published_at
 FROM site_publication_bindings b
 JOIN public.sites s ON s.id=b.site_id
 LEFT JOIN education_operation_sites os ON os.site_id=s.id
   AND os.valid_from<=CURRENT_TIMESTAMP
   AND (os.valid_through IS NULL OR os.valid_through>CURRENT_TIMESTAMP)
 LEFT JOIN v301_current_public_program_claims c ON c.operation_id=os.operation_id
 WHERE b.public_slug=requested_slug AND b.status='published'
$function$
;

-- CAN_SQL_STEP 12
DROP TABLE education_v30.sites RESTRICT;

-- CAN_SQL_STEP 13
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;

-- CAN_SQL_STEP 14
ALTER TABLE public.sites FORCE ROW LEVEL SECURITY;

-- CAN_SQL_STEP 15
REVOKE ALL PRIVILEGES ON TABLE public.sites FROM PUBLIC, authenticated, anonymous;

-- CAN_SQL_STEP 16
CREATE POLICY sites_no_direct_client_access ON public.sites AS RESTRICTIVE FOR ALL TO authenticated, anonymous USING (false) WITH CHECK (false);

COMMIT;
