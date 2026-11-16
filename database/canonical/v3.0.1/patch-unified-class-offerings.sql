-- Additive canonical Class architecture. NOT approved for production execution.
-- Requires existing canonical v3.0.1 tables, independent schema review and test01 QA.
-- No legacy Section mapping, imported registrations, compatibility adapters or backfills.
-- Enrollment and credential issuance writes remain disabled until scoped RLS,
-- auditing, source-record bridge and award-authority commands are implemented.
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
 enrollment_method text NOT NULL CHECK(enrollment_method IN ('self','invitation','assignment','approval')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','closed')),
 opens_at timestamptz,
 closes_at timestamptz,
 capacity integer CHECK(capacity IS NULL OR capacity>0),
 created_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 published_at timestamptz,
 closed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT canonical_class_offering_parent_fk FOREIGN KEY(class_offering_id,class_id)
   REFERENCES education_v30.class_offerings(id,class_id),
 CONSTRAINT canonical_class_offering_version_uq UNIQUE(class_offering_id,version_no),
 CONSTRAINT canonical_class_offering_version_class_uq UNIQUE(id,class_id),
 CONSTRAINT canonical_class_offering_window_ck CHECK(opens_at IS NULL OR closes_at IS NULL OR closes_at>opens_at),
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
 class_offering_version_id uuid NOT NULL,
 learner_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 enrollment_method text NOT NULL CHECK(enrollment_method IN ('self','invitation','assignment','approval')),
 award_intent text NOT NULL DEFAULT 'unspecified'
  CHECK(award_intent IN ('credit','certificate','participation','audit','unspecified')),
 status text NOT NULL DEFAULT 'pending'
  CHECK(status IN ('pending','active','completed','withdrawn','cancelled')),
 course_attempt_id uuid REFERENCES education_v30.learner_course_attempts(id),
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
          OLD.visibility,OLD.enrollment_method,OLD.opens_at,OLD.closes_at,
          OLD.capacity,OLD.created_by_person_id,OLD.published_at,OLD.created_at)
      IS DISTINCT FROM
      ROW(NEW.class_offering_id,NEW.class_id,NEW.version_no,
          NEW.visibility,NEW.enrollment_method,NEW.opens_at,NEW.closes_at,
          NEW.capacity,NEW.created_by_person_id,NEW.published_at,NEW.created_at)
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

-- Explicitly DENY new application roles until reviewed per-organization RLS
-- and verified authorization commands are supplied. No public discovery grant.
DO $$
DECLARE obj text;
BEGIN
 FOREACH obj IN ARRAY ARRAY[
 'classes','class_offerings','class_offering_versions',
 'class_enrollments','class_outcomes','class_awards'
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
