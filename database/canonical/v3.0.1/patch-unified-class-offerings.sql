-- Additive canonical Class architecture. NOT approved for production execution.
-- Requires existing canonical v3.0.1 tables, independent schema review and test01 QA.
-- No legacy Section mapping, imported registrations, compatibility adapters or backfills.
-- Enrollment and credential issuance writes remain disabled until scoped RLS,
-- auditing, native learner-participation integration and award-authority commands are implemented.
BEGIN;

CREATE TABLE IF NOT EXISTS education_v30.classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id),
 adoption_id uuid NOT NULL,
 offering_version_id uuid NOT NULL,
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 operating_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 site_id uuid REFERENCES education_v30.sites(id),
 title text NOT NULL CHECK(length(btrim(title)) BETWEEN 3 AND 200),
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 delivery_mode text NOT NULL CHECK(delivery_mode IN ('self_paced','scheduled','facilitated','hybrid')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','approved','active','completed','cancelled')),
 created_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_adoption_fk FOREIGN KEY (adoption_id,deployment_id,offering_version_id)
   REFERENCES education_v30.deployment_offering_adoptions(id,deployment_id,offering_version_id),
 CONSTRAINT canonical_class_offering_course_fk FOREIGN KEY (offering_version_id,course_version_id)
   REFERENCES education_v30.offering_courses(offering_version_id,course_version_id)
);
CREATE INDEX IF NOT EXISTS canonical_classes_operator_idx
 ON education_v30.classes(operating_organization_id,state);
CREATE INDEX IF NOT EXISTS canonical_classes_course_idx
 ON education_v30.classes(course_version_id,deployment_id);
CREATE INDEX IF NOT EXISTS canonical_classes_discovery_title_idx
 ON education_v30.classes(title,id) WHERE state='active';

CREATE TABLE IF NOT EXISTS education_v30.class_offerings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_offerings_class_uq UNIQUE(class_id),
 CONSTRAINT canonical_class_offerings_id_class_uq UNIQUE(id,class_id)
);
CREATE TABLE IF NOT EXISTS education_v30.class_offering_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_offering_id uuid NOT NULL,
 class_id uuid NOT NULL,
 version_no integer NOT NULL CHECK(version_no>=1),
 visibility text NOT NULL CHECK(visibility IN ('public','unlisted','private')),
 enrollment_methods text[] NOT NULL CHECK(cardinality(enrollment_methods) BETWEEN 1 AND 4 AND enrollment_methods <@ ARRAY['self','invitation','assignment','approval']::text[]),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','closed')),
 opens_at timestamptz,
 closes_at timestamptz,
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 allowed_credit_modes text[] NOT NULL CHECK(
   cardinality(allowed_credit_modes) BETWEEN 1 AND 3
   AND allowed_credit_modes <@ ARRAY['for_credit','audit','not_applicable']::text[]
 ),
 consent_version text,
 consent_text text,
 created_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 published_at timestamptz,
 closed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_offering_parent_fk FOREIGN KEY(class_offering_id,class_id)
   REFERENCES education_v30.class_offerings(id,class_id),
 CONSTRAINT canonical_class_offering_version_uq UNIQUE(class_offering_id,version_no),
 CONSTRAINT canonical_class_offering_version_class_uq UNIQUE(id,class_id),
 CONSTRAINT canonical_class_offering_window_ck CHECK(opens_at IS NULL OR closes_at IS NULL OR closes_at>opens_at),
 CONSTRAINT canonical_class_offering_consent_ck CHECK(
   NOT('self'=ANY(enrollment_methods)) OR (
      consent_version IS NOT NULL AND consent_text IS NOT NULL
      AND length(btrim(consent_version)) BETWEEN 3 AND 80
      AND length(btrim(consent_text)) BETWEEN 25 AND 10000
   )
 ),
 CONSTRAINT canonical_class_offering_publication_ck CHECK (
  (state='draft' AND published_at IS NULL AND closed_at IS NULL)
  OR (state='published' AND published_at IS NOT NULL AND closed_at IS NULL)
  OR (state='closed' AND published_at IS NOT NULL AND closed_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS canonical_class_offering_one_published_uq
 ON education_v30.class_offering_versions(class_offering_id) WHERE state='published';

CREATE TABLE IF NOT EXISTS education_v30.class_enrollments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 class_offering_version_id uuid,
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 enrollment_method text NOT NULL CHECK(enrollment_method IN ('self','invitation','assignment','approval')),
 credit_mode text NOT NULL DEFAULT 'not_applicable'
  CHECK(credit_mode IN ('for_credit','audit','not_applicable')),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','active','completed','withdrawn','cancelled')),
 course_attempt_id uuid REFERENCES education_v30.learner_course_attempts(id),
 enrolled_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 consent_version text,
 consent_sha256 text,
 consented_at timestamptz,
 CONSTRAINT canonical_class_enrollment_consent_ck CHECK(
  (enrollment_method='self' AND consent_version IS NOT NULL AND consent_sha256 IS NOT NULL AND consented_at IS NOT NULL)
  OR (enrollment_method<>'self' AND consent_version IS NULL AND consent_sha256 IS NULL AND consented_at IS NULL)
 ),
 CONSTRAINT canonical_class_enroll_publication_ck CHECK (
   enrollment_method<>'self' OR class_offering_version_id IS NOT NULL
 ),
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_enroll_offering_fk FOREIGN KEY(class_offering_version_id,class_id)
   REFERENCES education_v30.class_offering_versions(id,class_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS canonical_class_enroll_active_uq
 ON education_v30.class_enrollments(class_id,learner_person_id)
 WHERE status IN ('pending','active');
CREATE UNIQUE INDEX IF NOT EXISTS canonical_class_enroll_attempt_uq
 ON education_v30.class_enrollments(course_attempt_id)
 WHERE course_attempt_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS canonical_class_enroll_person_idx
 ON education_v30.class_enrollments(learner_person_id,status);
CREATE INDEX IF NOT EXISTS canonical_class_enroll_class_idx
 ON education_v30.class_enrollments(class_id,status);

-- The learner, Class, enrollment provenance and accepted consent identify one
-- immutable participation record. Changes of learner or registration terms
-- require a new reviewed enrollment, never a silent UPDATE of old evidence.
-- Only status transitions and governed Course Attempt pointers may change.
CREATE OR REPLACE FUNCTION education_v30.canonical_class_enrollment_identity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Class Enrollment history must be preserved' USING ERRCODE='23514';
 END IF;
 IF ROW(OLD.class_id,OLD.class_offering_version_id,OLD.learner_person_id,
        OLD.enrollment_method,OLD.credit_mode,OLD.enrolled_by_person_id,
        OLD.consent_version,OLD.consent_sha256,OLD.consented_at,OLD.enrolled_at)
    IS DISTINCT FROM
    ROW(NEW.class_id,NEW.class_offering_version_id,NEW.learner_person_id,
        NEW.enrollment_method,NEW.credit_mode,NEW.enrolled_by_person_id,
        NEW.consent_version,NEW.consent_sha256,NEW.consented_at,NEW.enrolled_at) THEN
   RAISE EXCEPTION 'Class Enrollment person, source and consent are immutable'
     USING ERRCODE='23514';
 END IF;
 IF (OLD.status IN ('completed','withdrawn','cancelled')
       AND NEW.status IS DISTINCT FROM OLD.status)
    OR (OLD.status='active' AND NEW.status='pending') THEN
   RAISE EXCEPTION 'Class Enrollment cannot be resurrected or rolled back'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS canonical_class_enrollment_identity_guard_trg
 ON education_v30.class_enrollments;
CREATE TRIGGER canonical_class_enrollment_identity_guard_trg
 BEFORE UPDATE OR DELETE ON education_v30.class_enrollments
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_enrollment_identity_guard();

-- Observed outcomes are distinct from awards. Never rewrite official grades
-- or issue a credential based on a content-completion flag.
CREATE TABLE IF NOT EXISTS education_v30.class_outcomes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_enrollment_id uuid NOT NULL REFERENCES education_v30.class_enrollments(id),
 outcome_kind text NOT NULL CHECK(outcome_kind IN ('grade','competency','completion','assessment')),
 result_code text NOT NULL CHECK(length(btrim(result_code)) BETWEEN 1 AND 120),
 source_kind text NOT NULL CHECK(length(btrim(source_kind)) BETWEEN 1 AND 80),
 source_id uuid NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_outcome_source_uq UNIQUE(class_enrollment_id,outcome_kind,source_kind,source_id)
);
CREATE TABLE IF NOT EXISTS education_v30.class_awards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_outcome_id uuid NOT NULL REFERENCES education_v30.class_outcomes(id),
 award_kind text NOT NULL CHECK(award_kind IN ('academic_credit','certificate','credential','participation')),
 issuing_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 policy_evidence_version_id uuid NOT NULL REFERENCES education_v30.evidence_document_versions(id),
 issued_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz CHECK(revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE INDEX IF NOT EXISTS canonical_class_awards_outcome_idx
 ON education_v30.class_awards(class_outcome_id,issued_at);

-- Class instructional authority is explicit and independent of publisher
-- content authoring, general Site role, learner enrollment and credit issuance.
CREATE TABLE IF NOT EXISTS education_v30.class_staff_assignments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 role_code text NOT NULL CHECK(role_code IN ('teacher','facilitator')),
 attendance_authorized boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'approved' CHECK(state IN ('approved','suspended','ended')),
 begins_at timestamptz NOT NULL DEFAULT now(),
 ends_at timestamptz,
 assigned_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_staff_window_ck CHECK(ends_at IS NULL OR ends_at>begins_at)
);
CREATE INDEX IF NOT EXISTS canonical_class_staff_class_idx
 ON education_v30.class_staff_assignments(class_id,state);
CREATE INDEX IF NOT EXISTS canonical_class_staff_person_idx
 ON education_v30.class_staff_assignments(person_id,state);
CREATE UNIQUE INDEX IF NOT EXISTS canonical_class_staff_one_live_role_uq
 ON education_v30.class_staff_assignments(class_id,person_id,role_code)
 WHERE state='approved';

CREATE OR REPLACE FUNCTION education_v30.canonical_class_staff_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Class staff assignment history must be preserved' USING ERRCODE='23514';
 END IF;
 IF ROW(OLD.class_id,OLD.person_id,OLD.role_code,OLD.attendance_authorized,OLD.begins_at,
        OLD.assigned_by_person_id,OLD.created_at)
    IS DISTINCT FROM
    ROW(NEW.class_id,NEW.person_id,NEW.role_code,NEW.attendance_authorized,NEW.begins_at,
        NEW.assigned_by_person_id,NEW.created_at) THEN
   RAISE EXCEPTION 'Class staff authority is immutable; end and reassign' USING ERRCODE='23514';
 END IF;
 IF OLD.state<>'approved' AND NEW.state IS DISTINCT FROM OLD.state THEN
   RAISE EXCEPTION 'Class staff authority cannot be resurrected' USING ERRCODE='23514';
 END IF;
 IF OLD.ends_at IS NOT NULL AND OLD.ends_at IS DISTINCT FROM NEW.ends_at THEN
   RAISE EXCEPTION 'Class staff end date cannot be rewritten' USING ERRCODE='23514';
 END IF;
 IF OLD.state='approved' AND NEW.state<>'approved' AND NEW.ends_at IS NULL THEN
   RAISE EXCEPTION 'Ending staff authority requires an end time' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_staff_guard_trg
 ON education_v30.class_staff_assignments;
CREATE TRIGGER canonical_class_staff_guard_trg BEFORE UPDATE OR DELETE
 ON education_v30.class_staff_assignments FOR EACH ROW
 EXECUTE FUNCTION education_v30.canonical_class_staff_guard();

-- One Class owns an exact dated canonical delivery Session and its classroom
-- plan. A plan at the same Site/Course must NEVER enroll an unrelated Class.
CREATE TABLE IF NOT EXISTS education_v30.class_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 classroom_plan_id uuid NOT NULL UNIQUE
   REFERENCES education_v30.facilitated_classroom_plans(id),
 delivery_session_id uuid NOT NULL UNIQUE
   REFERENCES education_v30.delivery_sessions(id),
 facilitator_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 request_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_session_request_uq UNIQUE(class_id,facilitator_person_id,request_id)
);
CREATE INDEX IF NOT EXISTS canonical_class_session_class_idx
 ON education_v30.class_sessions(class_id,created_at);

CREATE OR REPLACE FUNCTION education_v30.canonical_class_session_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE bound record;
BEGIN
 IF TG_OP='UPDATE' OR TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Class Session identity is immutable' USING ERRCODE='23514';
 END IF;
 SELECT c.id AS class_id,p.id AS plan_id,p.delivery_session_id,
   p.facilitator_person_id,p.request_id
 INTO bound FROM education_v30.classes c
 JOIN education_v30.facilitated_classroom_plans p ON
   p.deployment_id=c.deployment_id AND p.course_version_id=c.course_version_id
   AND p.site_id=c.site_id AND p.host_organization_id=c.operating_organization_id
 JOIN education_v30.delivery_sessions d ON d.id=p.delivery_session_id
   AND d.deployment_id=c.deployment_id AND d.site_id=c.site_id
 WHERE c.id=NEW.class_id AND c.state='active'
   AND c.site_id IS NOT NULL AND p.id=NEW.classroom_plan_id
   AND p.delivery_session_id=NEW.delivery_session_id
   AND p.state='scheduled'
   AND p.enrollment_release_id IS NULL;
 IF NOT FOUND OR bound.facilitator_person_id<>NEW.facilitator_person_id
   OR bound.request_id<>NEW.request_id THEN
   RAISE EXCEPTION 'Class Session must match exactly one scheduled Class/plan'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_session_guard_trg
 ON education_v30.class_sessions;
CREATE TRIGGER canonical_class_session_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE ON education_v30.class_sessions
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_session_guard();

-- A native Class plan cannot be repurposed as a legacy release, redirected
-- to another Site/Course, or resurrected after cancellation. Once started,
-- its facilitated room ID is immutable: unlinking it could make a formerly
-- native Class room appear to be a generic Course/Site room. Keep scheduling
-- times in delivery_sessions; controlled updates to plan state remain audited.
CREATE OR REPLACE FUNCTION education_v30.canonical_class_plan_boundary()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM education_v30.class_sessions
   WHERE classroom_plan_id=OLD.id) THEN
  IF ROW(NEW.delivery_session_id,NEW.deployment_id,NEW.course_version_id,
         NEW.site_id,NEW.host_organization_id,NEW.facilitator_person_id,
         NEW.request_id)
     IS DISTINCT FROM
     ROW(OLD.delivery_session_id,OLD.deployment_id,OLD.course_version_id,
         OLD.site_id,OLD.host_organization_id,OLD.facilitator_person_id,
         OLD.request_id)
     OR NEW.enrollment_release_id IS NOT NULL
     OR (OLD.facilitated_session_id IS NOT NULL
          AND NEW.facilitated_session_id IS DISTINCT FROM OLD.facilitated_session_id)
     OR (OLD.state='started' AND NEW.state<>'started')
     OR (OLD.state='cancelled' AND NEW.state<>'cancelled') THEN
    RAISE EXCEPTION 'Class Session cannot be repurposed or linked to another release'
     USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_plan_boundary_trg
 ON education_v30.facilitated_classroom_plans;
CREATE TRIGGER canonical_class_plan_boundary_trg
 BEFORE UPDATE ON education_v30.facilitated_classroom_plans
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_plan_boundary();

-- A Class cannot silently change to a different Course/adoption after creation.
CREATE OR REPLACE FUNCTION education_v30.canonical_class_identity_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Class history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF ROW(OLD.deployment_id,OLD.adoption_id,OLD.offering_version_id,
        OLD.course_version_id,OLD.operating_organization_id,
        OLD.site_id)
    IS DISTINCT FROM
    ROW(NEW.deployment_id,NEW.adoption_id,NEW.offering_version_id,
        NEW.course_version_id,NEW.operating_organization_id,
        NEW.site_id) THEN
   RAISE EXCEPTION 'Class identity and authority are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_identity_guard_trg ON education_v30.classes;
CREATE TRIGGER canonical_class_identity_guard_trg BEFORE UPDATE OR DELETE
 ON education_v30.classes FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_identity_guard();

-- Published terms are frozen. New terms require closure and a new version.
CREATE OR REPLACE FUNCTION education_v30.canonical_class_offering_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Class Offering history cannot be deleted' USING ERRCODE='23514'; END IF;
 IF OLD.state IN ('published','closed') THEN
   IF ROW(OLD.class_offering_id,OLD.class_id,OLD.version_no,
          OLD.visibility,OLD.enrollment_methods,OLD.opens_at,OLD.closes_at,
          OLD.capacity,OLD.allowed_credit_modes,OLD.consent_version,OLD.consent_text,OLD.created_by_person_id,OLD.published_at,OLD.created_at)
      IS DISTINCT FROM
      ROW(NEW.class_offering_id,NEW.class_id,NEW.version_no,
          NEW.visibility,NEW.enrollment_methods,NEW.opens_at,NEW.closes_at,
          NEW.capacity,NEW.allowed_credit_modes,NEW.consent_version,NEW.consent_text,NEW.created_by_person_id,NEW.published_at,NEW.created_at)
      OR NOT (
        (OLD.state=NEW.state AND OLD.closed_at IS NOT DISTINCT FROM NEW.closed_at)
        OR (OLD.state='published' AND NEW.state='closed' AND NEW.closed_at IS NOT NULL)
      ) THEN
     RAISE EXCEPTION 'Published Class Offering terms are immutable' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS canonical_class_offering_guard_trg ON education_v30.class_offering_versions;
CREATE TRIGGER canonical_class_offering_guard_trg BEFORE UPDATE OR DELETE
 ON education_v30.class_offering_versions FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_offering_guard();

CREATE OR REPLACE FUNCTION education_v30.canonical_class_evidence_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Class outcome evidence is append-only' USING ERRCODE='23514'; END $$;
DROP TRIGGER IF EXISTS canonical_class_outcome_guard_trg ON education_v30.class_outcomes;
CREATE TRIGGER canonical_class_outcome_guard_trg BEFORE UPDATE OR DELETE
 ON education_v30.class_outcomes FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_evidence_guard();

-- A single canonical survey Version may be published nationally, then
-- used in separately authorized, local Class-specific campaigns. The link
-- does NOT copy survey questions, answers, invitations or Course content.
-- One campaign belongs to one Class only; a Class can have several campaigns.
CREATE TABLE IF NOT EXISTS education_v30.class_survey_campaigns (
  campaign_id uuid PRIMARY KEY REFERENCES education_v30.survey_campaigns(id),
  class_id uuid NOT NULL REFERENCES education_v30.classes(id),
  linked_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS class_survey_campaign_class_idx
 ON education_v30.class_survey_campaigns(class_id);

CREATE OR REPLACE FUNCTION education_v30.canonical_class_survey_campaign_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
DECLARE c record; sc record;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION 'Class survey campaign attribution is immutable'
      USING ERRCODE='23514';
  END IF;
  SELECT deployment_id,operating_organization_id,state
    INTO c FROM education_v30.classes WHERE id=NEW.class_id;
  SELECT deployment_id,operating_organization_id,response_mode,status
    INTO sc FROM education_v30.survey_campaigns WHERE id=NEW.campaign_id;
  IF c.deployment_id IS NULL OR sc.deployment_id IS NULL OR
     c.deployment_id<>sc.deployment_id OR
     c.operating_organization_id<>sc.operating_organization_id OR
     c.state NOT IN ('approved','active') OR
     sc.response_mode<>'identified' OR sc.status NOT IN ('scheduled','active') THEN
    RAISE EXCEPTION 'Survey campaign requires exact current Class, Deployment and operator'
      USING ERRCODE='23514';
  END IF;
  -- Never reinterpret historical invitations or submitted results
  -- as belonging to a different local Class.
  IF EXISTS(SELECT 1 FROM education_v30.survey_invitations
            WHERE campaign_id=NEW.campaign_id)
     OR EXISTS(SELECT 1 FROM education_v30.survey_responses
            WHERE campaign_id=NEW.campaign_id) THEN
    RAISE EXCEPTION 'Class attribution must precede survey invitations'
      USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $;
DROP TRIGGER IF EXISTS canonical_class_survey_campaign_guard_trg
 ON education_v30.class_survey_campaigns;
CREATE TRIGGER canonical_class_survey_campaign_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE ON education_v30.class_survey_campaigns
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_class_survey_campaign_guard();

-- A campaign's Class attribution remains meaningful only if its canonical
-- campaign owner, Deployment, Survey version and response mode cannot be
-- silently moved after the link. Closing/pausing is still permitted.
CREATE OR REPLACE FUNCTION education_v30.canonical_linked_survey_scope_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
  IF EXISTS(SELECT 1 FROM education_v30.class_survey_campaigns
            WHERE campaign_id=OLD.id) THEN
    IF TG_OP='DELETE' THEN
      RAISE EXCEPTION 'Class-attributed survey campaigns cannot be deleted'
        USING ERRCODE='23514';
    END IF;
    IF ROW(OLD.deployment_id,OLD.operating_organization_id,
           OLD.survey_version_id,OLD.response_mode)
       IS DISTINCT FROM
       ROW(NEW.deployment_id,NEW.operating_organization_id,
           NEW.survey_version_id,NEW.response_mode) THEN
      RAISE EXCEPTION 'Class-attributed survey campaign identity is immutable'
        USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $;
DROP TRIGGER IF EXISTS canonical_linked_survey_scope_guard_trg
 ON education_v30.survey_campaigns;
CREATE TRIGGER canonical_linked_survey_scope_guard_trg
 BEFORE UPDATE OR DELETE ON education_v30.survey_campaigns
 FOR EACH ROW EXECUTE FUNCTION education_v30.canonical_linked_survey_scope_guard();

-- Explicitly DENY new application roles until reviewed per-organization RLS
-- and verified authorization commands are supplied. No public discovery grant.
DO $$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY[
 'classes','class_offerings','class_offering_versions',
 'class_enrollments','class_outcomes','class_awards','class_staff_assignments','class_sessions',
  'class_survey_campaigns'
 ] LOOP
  EXECUTE format('ALTER TABLE education_v30.%I ENABLE ROW LEVEL SECURITY',obj);
  EXECUTE format('ALTER TABLE education_v30.%I FORCE ROW LEVEL SECURITY',obj);
  EXECUTE format('REVOKE ALL ON education_v30.%I FROM PUBLIC',obj);
  IF NOT EXISTS (
   SELECT 1 FROM pg_policies WHERE schemaname='education_v30'
    AND tablename=obj AND policyname=obj||'_owner_only'
  ) THEN
   EXECUTE format(
    'CREATE POLICY %I ON education_v30.%I FOR ALL TO neondb_owner USING(true) WITH CHECK(true)',
     obj||'_owner_only',obj);
  END IF;
 END LOOP;
END $$;
COMMIT;
