-- CAN OS main-only, schema consolidation of 3 empty noncolliding capability tables.
-- Their identity, FKs, indexes, privileges and OIDs are retained by SET SCHEMA.
-- Four native functions must point to new physical locations in the same transaction.
BEGIN;
-- CAN_MIGRATION_STEP 1
SET LOCAL lock_timeout = '5s';

-- CAN_MIGRATION_STEP 2
SET LOCAL statement_timeout = '60s';

-- CAN_MIGRATION_STEP 3
DO $guard$
DECLARE candidate text; ref record; referenced_count integer;
BEGIN
 IF current_setting('neon.project_id',true) IS DISTINCT FROM 'sweet-hall-62441909'
    OR current_setting('neon.branch_id',true) IS DISTINCT FROM 'br-restless-sea-ar9ooo55'
    OR current_database()<>'neondb' THEN
   RAISE EXCEPTION 'Refusing a database other than CAN OS Neon main';
 END IF;
 FOREACH candidate IN ARRAY ARRAY['framework_competency_reuse_authorizations','network_memberships','official_authorization_scopes'] LOOP
   IF to_regclass('education_v30.'||candidate) IS NULL
     OR to_regclass('public.'||candidate) IS NOT NULL THEN
      RAISE EXCEPTION 'Source missing or destination collision for %',candidate;
   END IF;
   IF EXISTS (SELECT 1 FROM pg_class c
      WHERE c.oid=to_regclass('education_v30.'||candidate)
        AND (c.relrowsecurity OR c.relforcerowsecurity)) THEN
      RAISE EXCEPTION 'Unexpected RLS state for %',candidate;
   END IF;
   IF EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid=to_regclass('education_v30.'||candidate)) THEN
      RAISE EXCEPTION 'Policy change detected on %',candidate;
   END IF;
   IF EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid=to_regclass('education_v30.'||candidate) AND NOT t.tgisinternal) THEN
      RAISE EXCEPTION 'Custom trigger detected on %',candidate;
   END IF;
   IF EXISTS (SELECT 1 FROM pg_constraint fk WHERE fk.confrelid=to_regclass('education_v30.'||candidate) AND fk.contype='f') THEN
      RAISE EXCEPTION 'Inbound foreign keys detected on %',candidate;
   END IF;
   EXECUTE format('SELECT count(*) FROM education_v30.%I',candidate) INTO referenced_count;
   IF referenced_count<>0 THEN RAISE EXCEPTION 'Source table % contains % records',candidate,referenced_count; END IF;
 END LOOP;
 SELECT count(*) INTO referenced_count
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname IN ('public','education_v30','education_v30_secure')
     AND p.prokind IN ('f','p')
     AND (pg_get_functiondef(p.oid) ILIKE '%framework_competency_reuse_authorizations%'
       OR pg_get_functiondef(p.oid) ILIKE '%network_memberships%'
       OR pg_get_functiondef(p.oid) ILIKE '%official_authorization_scopes%');
 IF referenced_count<>4 THEN RAISE EXCEPTION 'Unexpected SQL routine usage count %, expected 4',referenced_count; END IF;
END $guard$;

-- CAN_MIGRATION_STEP 4
ALTER TABLE education_v30.framework_competency_reuse_authorizations SET SCHEMA public;

-- CAN_MIGRATION_STEP 5
ALTER TABLE education_v30.network_memberships SET SCHEMA public;

-- CAN_MIGRATION_STEP 6
ALTER TABLE education_v30.official_authorization_scopes SET SCHEMA public;

-- CAN_MIGRATION_STEP 7
CREATE OR REPLACE FUNCTION education_v30.v26_validate_framework_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE owner_id uuid; steward_id uuid; framework_id_val uuid; competency_id_val uuid;
BEGIN
 SELECT f.steward_organization_id,f.id INTO steward_id,framework_id_val
   FROM academic_framework_versions fv JOIN academic_frameworks f ON f.id=fv.framework_id
   WHERE fv.id=NEW.framework_version_id;
 SELECT c.owner_organization_id,c.id INTO owner_id,competency_id_val
   FROM competency_versions cv JOIN competencies c ON c.id=cv.competency_id
   WHERE cv.id=NEW.competency_version_id;
 IF owner_id IS DISTINCT FROM steward_id AND NOT EXISTS (
   SELECT 1 FROM public.framework_competency_reuse_authorizations x
   WHERE x.framework_id=framework_id_val AND x.competency_id=competency_id_val
     AND x.authorizing_organization_id=owner_id AND x.status='approved'
     AND x.valid_from<=clock_timestamp()
     AND (x.valid_through IS NULL OR x.valid_through>clock_timestamp())) THEN
    RAISE EXCEPTION 'Cross-steward competency requires approved reuse rights'; END IF;
 RETURN NEW;
END $function$;

-- CAN_MIGRATION_STEP 8
CREATE OR REPLACE FUNCTION education_v30.v28_check_network_delegation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
BEGIN
 IF NEW.status='active' AND NOT EXISTS(
   SELECT 1 FROM education_networks n
   WHERE n.id=NEW.network_id AND n.steward_organization_id=NEW.delegator_organization_id
   UNION ALL
   SELECT 1 FROM public.network_memberships m
   WHERE m.network_id=NEW.network_id AND m.organization_id=NEW.delegator_organization_id
     AND m.status='active' AND m.valid_from<=NEW.valid_from::date
     AND (m.valid_through IS NULL OR m.valid_through>=NEW.valid_from::date)) THEN
  RAISE EXCEPTION 'Network delegator must hold network governance/active membership'; END IF;
 IF NEW.status='active' AND NOT EXISTS(SELECT 1 FROM public.network_memberships m
  WHERE m.network_id=NEW.network_id AND m.organization_id=NEW.delegate_organization_id
    AND m.status='active' AND m.valid_from<=NEW.valid_from::date
    AND (m.valid_through IS NULL OR m.valid_through>=NEW.valid_from::date)) THEN
  RAISE EXCEPTION 'Network delegation requires participating delegate'; END IF;
 RETURN NEW;
END $function$;

-- CAN_MIGRATION_STEP 9
CREATE OR REPLACE FUNCTION education_v30.v26_check_placement_authorization()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE actual_op uuid; actual_offering uuid; a record;
BEGIN
 IF NEW.status<>'approved' OR NOT NEW.enrollment_gate_enabled THEN RETURN NEW; END IF;
 SELECT * INTO a FROM official_authorizations WHERE id=NEW.placement_authorization_id;
 IF a.official_decision<>'approved' OR NEW.valid_from<a.effective_at OR
     (a.expires_at IS NOT NULL AND (NEW.valid_through IS NULL OR NEW.valid_through>a.expires_at)) THEN
    RAISE EXCEPTION 'Enrollment gate needs effective approved authorization'; END IF;
 actual_op:=NEW.operation_id;
 IF NEW.deployment_id IS NOT NULL THEN
    SELECT operation_id,offering_id INTO actual_op,actual_offering
       FROM program_deployments WHERE id=NEW.deployment_id;
 ELSIF NEW.offering_version_id IS NOT NULL THEN
    SELECT offering_id INTO actual_offering FROM offering_versions WHERE id=NEW.offering_version_id;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.official_authorization_scopes sc
    WHERE sc.authorization_id=NEW.placement_authorization_id AND
    ((actual_op IS NOT NULL AND sc.operation_id=actual_op) OR
      (actual_offering IS NOT NULL AND sc.offering_id=actual_offering))) THEN
     RAISE EXCEPTION 'Enrollment gate authorization does not cover operating scope'; END IF;
 RETURN NEW;
END $function$;

-- CAN_MIGRATION_STEP 10
CREATE OR REPLACE FUNCTION education_v30.v27_check_credential_support()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'education_v30', 'pg_catalog'
AS $function$
DECLARE issuer uuid; learner uuid; stage text; actual_learner uuid;
BEGIN
 SELECT issuing_organization_id,learner_id INTO issuer,learner FROM credential_issuances WHERE id=NEW.issuance_id;
 IF issuer IS DISTINCT FROM NEW.issuing_organization_id THEN
  RAISE EXCEPTION 'Credential support issuer must match actual credential issuer'; END IF;
 IF NEW.graduation_decision_id IS NOT NULL THEN
  SELECT learner_id INTO actual_learner FROM graduation_decisions WHERE id=NEW.graduation_decision_id;
  IF actual_learner IS DISTINCT FROM learner THEN RAISE EXCEPTION 'Graduation evidence belongs to different learner'; END IF;
 END IF;
 IF NEW.academic_credit_award_id IS NOT NULL THEN
  SELECT e.learner_id INTO actual_learner FROM academic_credit_awards a
   JOIN learner_course_attempts ca ON ca.id=a.course_attempt_id JOIN enrollments e ON e.id=ca.enrollment_id
   WHERE a.id=NEW.academic_credit_award_id;
  IF actual_learner IS DISTINCT FROM learner THEN RAISE EXCEPTION 'Credit support belongs to different learner'; END IF;
 END IF;
 IF NEW.operational_authorization_decision_id IS NOT NULL THEN
  SELECT stage_code INTO stage FROM operational_authorization_decisions
   WHERE id=NEW.operational_authorization_decision_id AND decision='approved'
    AND authority_organization_id=issuer AND valid_from<=clock_timestamp()
    AND (valid_through IS NULL OR valid_through>clock_timestamp())
    AND NOT EXISTS (SELECT 1 FROM operational_authorization_decisions newer
      WHERE newer.supersedes_id=NEW.operational_authorization_decision_id);
  IF stage IS DISTINCT FROM 'issue_credential' THEN
   RAISE EXCEPTION 'Credential issuance needs current issue_credential authorization'; END IF;
 END IF;
 IF NEW.authorization_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM official_authorizations a JOIN public.official_authorization_scopes s ON s.authorization_id=a.id
  WHERE a.id=NEW.authorization_id AND a.official_decision='approved'
   AND a.effective_at<=clock_timestamp() AND (a.expires_at IS NULL OR a.expires_at>clock_timestamp())
   AND s.organization_id=issuer
   AND NOT EXISTS(SELECT 1 FROM official_authorization_events e
    WHERE e.authorization_id=a.id AND e.event_kind IN ('revoked','suspended')
      AND e.effective_at<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Credential support lacks scoped issuer authorization'; END IF;
 RETURN NEW;
END $function$;
COMMIT;
