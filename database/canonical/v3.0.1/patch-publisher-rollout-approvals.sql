-- WS5 PROPOSED additive publisher/independent-operator rollout approval ledger.
-- REVIEW GATE: Do not apply until WS00 has accepted the schema, RLS, DB-role,
-- session and migration order contracts. No production migration is authorized.
-- No changes to native Class, Course, Enrollment, Assessment or Session records.
BEGIN;

CREATE TABLE IF NOT EXISTS education_v30.publisher_rollout_plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 publisher_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 offering_version_id uuid NOT NULL REFERENCES education_v30.offering_versions(id),
 revision integer NOT NULL CHECK(revision >= 1),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN
   ('draft','submitted','approved','denied','superseded','retired')),
 composition_sha256 char(64) NOT NULL CHECK(composition_sha256 ~ '^[a-f0-9]{64}$'),
 authored_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT publisher_rollout_plan_version_revision_uq UNIQUE(offering_version_id,revision),
 CONSTRAINT publisher_rollout_plan_version_ref_uq UNIQUE(id,offering_version_id),
 CONSTRAINT publisher_rollout_plan_submitted_ck CHECK (
   (state='draft' AND submitted_at IS NULL)
   OR (state<>'draft' AND submitted_at IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS publisher_rollout_one_approved_uq
 ON education_v30.publisher_rollout_plans(offering_version_id)
 WHERE state='approved';
CREATE INDEX IF NOT EXISTS publisher_rollout_publisher_idx
 ON education_v30.publisher_rollout_plans(publisher_organization_id,state);

-- The decision is an immutable reviewed event, not a mutable boolean.
CREATE TABLE IF NOT EXISTS education_v30.publisher_rollout_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL UNIQUE REFERENCES education_v30.publisher_rollout_plans(id),
 decision text NOT NULL CHECK(decision IN ('approved','denied')),
 reviewer_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 evidence_version_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 decided_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS education_v30.operator_rollout_applications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 plan_id uuid NOT NULL,
 offering_version_id uuid NOT NULL,
 deployment_id uuid NOT NULL REFERENCES education_v30.program_deployments(id),
 adoption_id uuid NOT NULL,
 operating_organization_id uuid NOT NULL REFERENCES education_v30.organizations(id),
 site_id uuid NOT NULL REFERENCES education_v30.sites(id),
 revision integer NOT NULL CHECK(revision >= 1),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN
   ('draft','submitted','approved','denied','withdrawn','activated','retired')),
 prepared_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 submitted_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT operator_rollout_exact_publisher_plan_fk
   FOREIGN KEY(plan_id,offering_version_id)
   REFERENCES education_v30.publisher_rollout_plans(id,offering_version_id),
 CONSTRAINT operator_rollout_exact_adoption_fk
   FOREIGN KEY(adoption_id,deployment_id,offering_version_id)
   REFERENCES education_v30.deployment_offering_adoptions(id,deployment_id,offering_version_id),
 CONSTRAINT operator_rollout_revision_uq
   UNIQUE(plan_id,deployment_id,adoption_id,site_id,revision),
 CONSTRAINT operator_rollout_submission_ck CHECK(
   (state='draft' AND submitted_at IS NULL)
   OR state='withdrawn'
   OR (state NOT IN ('draft','withdrawn') AND submitted_at IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS operator_rollout_site_status_idx
 ON education_v30.operator_rollout_applications(operating_organization_id,site_id,state);
CREATE UNIQUE INDEX IF NOT EXISTS operator_rollout_one_live_approved_uq
 ON education_v30.operator_rollout_applications(plan_id,deployment_id,site_id)
 WHERE state IN ('approved','activated');

CREATE TABLE IF NOT EXISTS education_v30.operator_rollout_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 application_id uuid NOT NULL UNIQUE REFERENCES education_v30.operator_rollout_applications(id),
 decision text NOT NULL CHECK(decision IN ('approved','denied')),
 reviewer_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 evidence_version_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 2000),
 decided_at timestamptz NOT NULL DEFAULT now()
);

-- Local Class links are referential provenance, not a new Class identity.
CREATE TABLE IF NOT EXISTS education_v30.operator_rollout_class_links (
 application_id uuid NOT NULL REFERENCES education_v30.operator_rollout_applications(id),
 class_id uuid NOT NULL UNIQUE REFERENCES education_v30.classes(id),
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 linked_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(application_id,class_id)
);

-- Immutable decision history; original decision records cannot be rewritten.
CREATE OR REPLACE FUNCTION education_v30.publisher_rollout_decision_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 RAISE EXCEPTION 'Publisher and operator rollout decision records are append-only'
   USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS publisher_rollout_decision_immutable_trg
 ON education_v30.publisher_rollout_decisions;
CREATE TRIGGER publisher_rollout_decision_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.publisher_rollout_decisions
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_decision_immutable();
DROP TRIGGER IF EXISTS operator_rollout_decision_immutable_trg
 ON education_v30.operator_rollout_decisions;
CREATE TRIGGER operator_rollout_decision_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.operator_rollout_decisions
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_decision_immutable();

-- Once submitted, these identifiers cannot be repointed to another
-- publisher, Site, operating Organization, adopted release or Course.
CREATE OR REPLACE FUNCTION education_v30.publisher_rollout_identity_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Rollout history cannot be deleted' USING ERRCODE='23514';
 END IF;
 IF TG_TABLE_NAME='publisher_rollout_plans' THEN
   IF ROW(NEW.publisher_organization_id,NEW.offering_version_id,NEW.revision,
          NEW.composition_sha256,NEW.authored_by_person_id,NEW.created_at)
      IS DISTINCT FROM
      ROW(OLD.publisher_organization_id,OLD.offering_version_id,OLD.revision,
          OLD.composition_sha256,OLD.authored_by_person_id,OLD.created_at) THEN
     RAISE EXCEPTION 'Publisher rollout plan identity is immutable'
       USING ERRCODE='23514';
   END IF;
 ELSIF TG_TABLE_NAME='operator_rollout_applications' THEN
   IF ROW(NEW.plan_id,NEW.offering_version_id,NEW.deployment_id,NEW.adoption_id,
          NEW.operating_organization_id,NEW.site_id,NEW.revision,
          NEW.prepared_by_person_id,NEW.created_at)
      IS DISTINCT FROM
      ROW(OLD.plan_id,OLD.offering_version_id,OLD.deployment_id,OLD.adoption_id,
          OLD.operating_organization_id,OLD.site_id,OLD.revision,
          OLD.prepared_by_person_id,OLD.created_at) THEN
     RAISE EXCEPTION 'Operator rollout identity is immutable'
       USING ERRCODE='23514';
   END IF;
 END IF;
 IF OLD.state IS DISTINCT FROM NEW.state THEN
   IF TG_TABLE_NAME='publisher_rollout_plans' THEN
     IF NOT (
       (OLD.state='draft' AND NEW.state='submitted')
       OR (OLD.state='submitted' AND NEW.state IN ('approved','denied'))
       OR (OLD.state='approved' AND NEW.state IN ('superseded','retired'))
     ) THEN
       RAISE EXCEPTION 'Publisher rollout state transition is not permitted'
         USING ERRCODE='23514';
     END IF;
     IF NEW.state IN ('approved','denied') AND NOT EXISTS (
       SELECT 1 FROM education_v30.publisher_rollout_decisions d
       WHERE d.plan_id=NEW.id AND d.decision=NEW.state
     ) THEN
       RAISE EXCEPTION 'A recorded independent publisher decision is required'
         USING ERRCODE='23514';
     END IF;
   ELSE
     IF NOT (
       (OLD.state='draft' AND NEW.state IN ('submitted','withdrawn'))
       OR (OLD.state='submitted' AND NEW.state IN ('approved','denied','withdrawn'))
       OR (OLD.state='approved' AND NEW.state IN ('activated','withdrawn'))
       OR (OLD.state='activated' AND NEW.state='retired')
     ) THEN
       RAISE EXCEPTION 'Operator rollout state transition is not permitted'
         USING ERRCODE='23514';
     END IF;
     IF NEW.state IN ('approved','denied') AND NOT EXISTS (
       SELECT 1 FROM education_v30.operator_rollout_decisions d
       WHERE d.application_id=NEW.id AND d.decision=NEW.state
     ) THEN
       RAISE EXCEPTION 'A recorded independent operator rollout decision is required'
         USING ERRCODE='23514';
     END IF;
     IF NEW.state='activated' AND NOT EXISTS (
       SELECT 1 FROM education_v30.operator_rollout_class_links l
       WHERE l.application_id=NEW.id
     ) THEN
       RAISE EXCEPTION 'Approved rollout must link a canonical Class before activation'
         USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS publisher_rollout_identity_immutable_trg
 ON education_v30.publisher_rollout_plans;
CREATE TRIGGER publisher_rollout_identity_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.publisher_rollout_plans
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_identity_immutable();
DROP TRIGGER IF EXISTS operator_rollout_identity_immutable_trg
 ON education_v30.operator_rollout_applications;
CREATE TRIGGER operator_rollout_identity_immutable_trg
 BEFORE UPDATE OR DELETE ON education_v30.operator_rollout_applications
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_identity_immutable();


-- Guard the append-only link between an approved local rollout application
-- and its *existing* canonical Class. The Class is never synthesized here.
CREATE OR REPLACE FUNCTION education_v30.operator_rollout_class_link_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
 IF TG_OP <> 'INSERT' THEN
   RAISE EXCEPTION 'Approved rollout Class provenance is immutable'
     USING ERRCODE='23514';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM education_v30.operator_rollout_applications a
   JOIN education_v30.classes c ON c.id=NEW.class_id
   JOIN education_v30.offering_courses oc
     ON oc.offering_version_id=a.offering_version_id
     AND oc.course_version_id=NEW.course_version_id
   WHERE a.id=NEW.application_id AND a.state IN ('approved','activated')
     AND c.deployment_id=a.deployment_id
     AND c.adoption_id=a.adoption_id
     AND c.offering_version_id=a.offering_version_id
     AND c.course_version_id=NEW.course_version_id
     AND c.operating_organization_id=a.operating_organization_id
     AND c.site_id=a.site_id
 ) THEN
   RAISE EXCEPTION 'Rollout Class must match approved Site, Organization, Deployment and Course version'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS operator_rollout_class_link_guard_trg
 ON education_v30.operator_rollout_class_links;
CREATE TRIGGER operator_rollout_class_link_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE ON education_v30.operator_rollout_class_links
 FOR EACH ROW EXECUTE FUNCTION education_v30.operator_rollout_class_link_guard();

-- At the DB boundary reviewers cannot approve their own work. A native
-- dedicated reviewer role, current publisher organization scope, and
-- independently verified person/session must STILL be checked by WS00's
-- purpose-specific SQL role/procedure before issuing these inserts.
CREATE OR REPLACE FUNCTION education_v30.publisher_rollout_review_independence()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $
BEGIN
 IF TG_TABLE_NAME='publisher_rollout_decisions' THEN
   IF NOT EXISTS (
     SELECT 1 FROM education_v30.publisher_rollout_plans p
     WHERE p.id=NEW.plan_id AND p.state='submitted'
       AND p.authored_by_person_id<>NEW.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Independent publisher plan reviewer required for a submitted revision'
       USING ERRCODE='23514';
   END IF;
 ELSE
   IF NOT EXISTS (
     SELECT 1 FROM education_v30.operator_rollout_applications a
     JOIN education_v30.publisher_rollout_plans p ON p.id=a.plan_id
     WHERE a.id=NEW.application_id AND a.state='submitted'
       AND p.state='approved'
       AND a.prepared_by_person_id<>NEW.reviewer_person_id
   ) THEN
     RAISE EXCEPTION 'Independent publisher reviewer and approved plan required'
       USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $;
DROP TRIGGER IF EXISTS publisher_rollout_review_independence_trg
 ON education_v30.publisher_rollout_decisions;
CREATE TRIGGER publisher_rollout_review_independence_trg
 BEFORE INSERT ON education_v30.publisher_rollout_decisions
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_review_independence();
DROP TRIGGER IF EXISTS operator_rollout_review_independence_trg
 ON education_v30.operator_rollout_decisions;
CREATE TRIGGER operator_rollout_review_independence_trg
 BEFORE INSERT ON education_v30.operator_rollout_decisions
 FOR EACH ROW EXECUTE FUNCTION education_v30.publisher_rollout_review_independence();

-- No general application or public grants. All commands are disabled until
-- WS00 provisions dedicated purpose-specific restricted DB roles, trusted
-- session binding, independent reviewer authorization and RLS acceptance.
ALTER TABLE education_v30.publisher_rollout_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.publisher_rollout_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.publisher_rollout_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.publisher_rollout_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_applications FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_class_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.operator_rollout_class_links FORCE ROW LEVEL SECURITY;

REVOKE ALL ON education_v30.publisher_rollout_plans,
 education_v30.publisher_rollout_decisions,
 education_v30.operator_rollout_applications,
 education_v30.operator_rollout_decisions,
 education_v30.operator_rollout_class_links FROM PUBLIC;

-- Temporary owner-only policy for migration review and isolated test01 work;
-- no operational roles are granted access by this patch.
CREATE POLICY publisher_rollout_plans_owner_only
 ON education_v30.publisher_rollout_plans FOR ALL TO neondb_owner
 USING (true) WITH CHECK(true);
CREATE POLICY publisher_rollout_decisions_owner_only
 ON education_v30.publisher_rollout_decisions FOR ALL TO neondb_owner
 USING (true) WITH CHECK(true);
CREATE POLICY operator_rollout_applications_owner_only
 ON education_v30.operator_rollout_applications FOR ALL TO neondb_owner
 USING (true) WITH CHECK(true);
CREATE POLICY operator_rollout_decisions_owner_only
 ON education_v30.operator_rollout_decisions FOR ALL TO neondb_owner
 USING (true) WITH CHECK(true);
CREATE POLICY operator_rollout_class_links_owner_only
 ON education_v30.operator_rollout_class_links FOR ALL TO neondb_owner
 USING (true) WITH CHECK(true);

COMMIT;

-- No data backfill; no automatic adoption migration; no existing Class
-- becomes a rollout-approved Class as a consequence of this DDL.
