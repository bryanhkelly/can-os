-- WS3 Native Class completion-policy proposal. DO NOT apply before WS00 review.
-- Additive policy + enrollment pinning only. Existing Class Outcome/Award ledgers
-- remain the sole authorities, and this migration grants NO completion writes.
-- Required baseline: canonical v3.0.1 native Class schema and scoped owner RLS.
BEGIN;
SET LOCAL search_path TO education_v30,pg_catalog;

CREATE TABLE IF NOT EXISTS education_v30.class_completion_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 version_no integer NOT NULL CHECK(version_no>0),
 require_all_lessons boolean NOT NULL DEFAULT false,
 required_verified_sessions integer NOT NULL DEFAULT 0 CHECK(required_verified_sessions>=0),
 require_passing_assessment boolean NOT NULL DEFAULT false,
 effective_at timestamptz NOT NULL,
 published_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 authored_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 approved_by_person_id uuid NOT NULL REFERENCES education_v30.persons(id),
 approved_policy_evidence_version_id uuid NOT NULL
   REFERENCES education_v30.evidence_document_versions(id),
 CONSTRAINT ws3_class_policy_independent_approval CHECK(
   authored_by_person_id<>approved_by_person_id),
 CONSTRAINT ws3_class_policy_nonempty_requirements CHECK(
   require_all_lessons OR required_verified_sessions>0 OR require_passing_assessment),
 CONSTRAINT ws3_class_policy_version_uq UNIQUE(class_id,version_no),
 CONSTRAINT ws3_class_policy_class_course_uq UNIQUE(id,class_id,course_version_id)
);

CREATE TABLE IF NOT EXISTS education_v30.class_enrollment_completion_pins (
 class_enrollment_id uuid PRIMARY KEY REFERENCES education_v30.class_enrollments(id),
 class_id uuid NOT NULL REFERENCES education_v30.classes(id),
 course_version_id uuid NOT NULL REFERENCES education_v30.course_versions(id),
 completion_policy_version_id uuid NOT NULL,
 pinned_at timestamptz NOT NULL,
 CONSTRAINT ws3_pin_policy_exact_class_course_fk
   FOREIGN KEY(completion_policy_version_id,class_id,course_version_id)
   REFERENCES education_v30.class_completion_policy_versions
     (id,class_id,course_version_id)
);
CREATE INDEX IF NOT EXISTS ws3_class_pins_policy_idx ON
 education_v30.class_enrollment_completion_pins(completion_policy_version_id);

-- Policy publication requires exact Class Course and independent reviewed,
-- current provider evidence. Publishing is not delegated by a general Site
-- or network membership. All published policy rows are immutable.
CREATE OR REPLACE FUNCTION education_v30.ws3_guard_class_completion_policy()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE c record; ev record;
BEGIN
 IF TG_OP<>'INSERT' THEN
   RAISE EXCEPTION 'Published Class completion policy is immutable'
     USING ERRCODE='23514';
 END IF;
 SELECT course_version_id,operating_organization_id INTO c
 FROM education_v30.classes WHERE id=NEW.class_id;
 IF c.course_version_id IS DISTINCT FROM NEW.course_version_id
    OR NEW.published_at>clock_timestamp() THEN
   RAISE EXCEPTION 'Class completion policy must pin one published Course version'
     USING ERRCODE='23514';
 END IF;
 SELECT v.verified_at,v.verified_by_person_id,v.valid_from,v.valid_through,
        doc.owning_organization_id INTO ev
 FROM education_v30.evidence_document_versions v
 JOIN education_v30.evidence_documents doc ON doc.id=v.document_id
 WHERE v.id=NEW.approved_policy_evidence_version_id;
 IF ev.owning_organization_id IS DISTINCT FROM c.operating_organization_id
    OR ev.verified_at IS NULL OR ev.verified_at>NEW.published_at
    OR ev.verified_by_person_id IS NULL
    OR ev.verified_by_person_id=NEW.authored_by_person_id
    OR (ev.valid_from IS NOT NULL AND ev.valid_from>NEW.published_at::date)
    OR (ev.valid_through IS NOT NULL AND ev.valid_through<NEW.published_at::date) THEN
   RAISE EXCEPTION 'Independent current publisher-owned policy evidence required'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ws3_class_completion_policy_guard_trg
 ON education_v30.class_completion_policy_versions;
CREATE TRIGGER ws3_class_completion_policy_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE
 ON education_v30.class_completion_policy_versions
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_guard_class_completion_policy();

-- Policy is pinned at the ORIGINAL enrollment creation, regardless of
-- self/assignment enrollment and whether a Class Offering exists.
-- Future published policy versions never rewrite an existing pin.
-- A Class without an eligible policy may enroll/deliver but cannot yet
-- receive an independently validated official completion decision.
CREATE OR REPLACE FUNCTION education_v30.ws3_pin_class_policy_on_enrollment()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE selected record;
BEGIN
 SELECT p.id,p.course_version_id INTO selected
 FROM education_v30.class_completion_policy_versions p
 JOIN education_v30.classes c ON c.id=p.class_id
 WHERE p.class_id=NEW.class_id
   AND p.course_version_id=c.course_version_id
   AND p.published_at<=NEW.enrolled_at
   AND p.effective_at<=NEW.enrolled_at
 ORDER BY p.effective_at DESC,p.version_no DESC
 LIMIT 1;
 IF selected.id IS NOT NULL THEN
   INSERT INTO education_v30.class_enrollment_completion_pins(
     class_enrollment_id,class_id,course_version_id,
     completion_policy_version_id,pinned_at
   ) VALUES(
     NEW.id,NEW.class_id,selected.course_version_id,selected.id,NEW.enrolled_at
   );
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ws3_class_enrollment_completion_pin_trg
 ON education_v30.class_enrollments;
CREATE TRIGGER ws3_class_enrollment_completion_pin_trg
 AFTER INSERT ON education_v30.class_enrollments
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_pin_class_policy_on_enrollment();

-- A pin cannot be altered even by a later policy publication, learner
-- withdrawal, re-enrollment or change of provider/network affiliation.
CREATE OR REPLACE FUNCTION education_v30.ws3_guard_class_completion_pin()
RETURNS trigger LANGUAGE plpgsql SET search_path=education_v30,pg_catalog AS $$
DECLARE e record; p record;
BEGIN
 IF TG_OP<>'INSERT' THEN
   RAISE EXCEPTION 'Participant Class completion-policy pin is immutable'
     USING ERRCODE='23514';
 END IF;
 SELECT class_id,enrolled_at INTO e FROM education_v30.class_enrollments
 WHERE id=NEW.class_enrollment_id;
 SELECT class_id,course_version_id,published_at,effective_at INTO p
 FROM education_v30.class_completion_policy_versions
 WHERE id=NEW.completion_policy_version_id;
 IF e.class_id IS DISTINCT FROM NEW.class_id OR
    p.class_id IS DISTINCT FROM NEW.class_id OR
    p.course_version_id IS DISTINCT FROM NEW.course_version_id OR
    p.published_at>e.enrolled_at OR p.effective_at>e.enrolled_at OR
    NEW.pinned_at IS DISTINCT FROM e.enrolled_at THEN
   RAISE EXCEPTION 'Completion policy pin must match original enrolled-at authority'
     USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ws3_class_completion_pin_guard_trg
 ON education_v30.class_enrollment_completion_pins;
CREATE TRIGGER ws3_class_completion_pin_guard_trg
 BEFORE INSERT OR UPDATE OR DELETE
 ON education_v30.class_enrollment_completion_pins
 FOR EACH ROW EXECUTE FUNCTION education_v30.ws3_guard_class_completion_pin();

ALTER TABLE education_v30.class_completion_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.class_completion_policy_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.class_completion_policy_versions FROM PUBLIC;
CREATE POLICY ws3_class_completion_policy_owner_only
 ON education_v30.class_completion_policy_versions
 FOR ALL TO neondb_owner USING (true) WITH CHECK (true);
ALTER TABLE education_v30.class_enrollment_completion_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE education_v30.class_enrollment_completion_pins FORCE ROW LEVEL SECURITY;
REVOKE ALL ON education_v30.class_enrollment_completion_pins FROM PUBLIC;
CREATE POLICY ws3_class_completion_pin_owner_only
 ON education_v30.class_enrollment_completion_pins
 FOR ALL TO neondb_owner USING (true) WITH CHECK (true);

-- No existing Class outcome or award is promoted to verified completion by
-- this patch. No learner/operator application grants. No backfill.
COMMIT;
