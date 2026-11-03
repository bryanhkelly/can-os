-- Additive jurisdiction policy and academic approval storage.
CREATE TABLE IF NOT EXISTS jurisdiction_profile_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE RESTRICT,
 revision text NOT NULL,
 status text NOT NULL DEFAULT 'draft',
 title text NOT NULL,
 summary text NOT NULL,
 profile jsonb NOT NULL DEFAULT '{}'::jsonb,
 review_owner_person_id uuid,
 reviewed_at timestamptz,
 next_review_at timestamptz,
 source_updated_at timestamptz,
 content_schema_version text NOT NULL DEFAULT '1',
 verification_status text NOT NULL DEFAULT 'unverified',
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 effective_at timestamptz,
 published_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT jurisdiction_profile_revision_uq UNIQUE (jurisdiction_id, revision),
 CONSTRAINT jurisdiction_profile_status_check CHECK (status IN ('draft','in_review','published','archived'))
);
CREATE INDEX IF NOT EXISTS jurisdiction_profile_status_idx ON jurisdiction_profile_versions (jurisdiction_id,status);
CREATE TABLE IF NOT EXISTS curriculum_jurisdiction_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 course_template_version_id uuid NOT NULL REFERENCES course_template_versions(id) ON DELETE RESTRICT,
 jurisdiction_id uuid NOT NULL REFERENCES jurisdictions(id) ON DELETE RESTRICT,
 academic_purpose text NOT NULL,
 status text NOT NULL,
 authority_organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 effective_at timestamptz,
 expires_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT curriculum_jurisdiction_approval_scope_uq UNIQUE (course_template_version_id,jurisdiction_id,academic_purpose),
 CONSTRAINT curriculum_jurisdiction_approval_status_check CHECK (status IN ('not_evaluated','under_review','approved','conditionally_approved','not_approved','expired'))
);
CREATE INDEX IF NOT EXISTS curriculum_jurisdiction_approval_jurisdiction_idx ON curriculum_jurisdiction_approvals (jurisdiction_id,status);
