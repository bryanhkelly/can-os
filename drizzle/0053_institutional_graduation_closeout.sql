CREATE TABLE graduation_requirement_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
 academic_year text NOT NULL,
 version text NOT NULL,
 requirements jsonb NOT NULL,
 approved_by_person_id uuid NOT NULL REFERENCES people(id),
 approved_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT graduation_requirements_issuer_year_version_uq UNIQUE(issuing_organization_id,academic_year,version),
 CONSTRAINT graduation_requirements_array CHECK(jsonb_typeof(requirements)='array')
);
CREATE TABLE graduation_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 student_profile_id uuid NOT NULL REFERENCES student_profiles(id),
 issuing_organization_id uuid NOT NULL REFERENCES organizations(id),
 requirement_set_id uuid NOT NULL REFERENCES graduation_requirement_sets(id),
 transcript_issuance_id uuid NOT NULL REFERENCES transcript_issuances(id),
 decision text NOT NULL CHECK(decision IN ('approved','denied')),
 audit jsonb NOT NULL,
 decided_by_person_id uuid NOT NULL REFERENCES people(id),
 decided_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX graduation_decision_student_idx ON graduation_decisions(student_profile_id);
CREATE TABLE diploma_issuances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 graduation_decision_id uuid NOT NULL REFERENCES graduation_decisions(id) UNIQUE,
 issued_by_person_id uuid NOT NULL REFERENCES people(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz,
 revocation_reason text,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT diploma_revocation_pair CHECK ((revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked_at IS NOT NULL AND length(trim(revocation_reason))>0))
);
-- Defense in depth: approved graduation and matching issuer are prerequisites.
CREATE FUNCTION enforce_diploma_graduation_approval() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM graduation_decisions d
  JOIN graduation_requirement_sets r ON r.id=d.requirement_set_id
  JOIN transcript_issuances t ON t.id=d.transcript_issuance_id
  WHERE d.id=NEW.graduation_decision_id AND d.decision='approved'
  AND d.issuing_organization_id=r.issuing_organization_id
  AND d.issuing_organization_id=t.issuing_organization_id
  AND d.student_profile_id=t.student_profile_id)
 THEN RAISE EXCEPTION 'Diploma requires approved, issuer-matched graduation decision'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER diploma_graduation_approval BEFORE INSERT OR UPDATE OF graduation_decision_id
ON diploma_issuances FOR EACH ROW EXECUTE FUNCTION enforce_diploma_graduation_approval();
