-- Agent G additive migration PROPOSAL. Coordinator assigns sequential number and journal entry.
-- Do not apply to shared FullFlow or production database.
CREATE TABLE IF NOT EXISTS curriculum_annual_adoptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 program_id uuid NOT NULL REFERENCES programs(id) ON DELETE RESTRICT,
 site_id uuid REFERENCES sites(id) ON DELETE RESTRICT,
 academic_provider_organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 academic_year_id uuid NOT NULL REFERENCES school_years(id) ON DELETE RESTRICT,
 pack_id uuid NOT NULL REFERENCES curriculum_packs(id) ON DELETE RESTRICT,
 pack_version_id uuid NOT NULL REFERENCES curriculum_pack_versions(id) ON DELETE RESTRICT,
 entitlement_id uuid NOT NULL REFERENCES curriculum_entitlements(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'active',
 superseded_at timestamptz,
 created_by_person_id uuid NOT NULL REFERENCES people(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS curriculum_annual_adoption_program_year_pack_uq
 ON curriculum_annual_adoptions(program_id,academic_year_id,pack_id);
CREATE INDEX IF NOT EXISTS curriculum_annual_adoption_org_year_idx
 ON curriculum_annual_adoptions(organization_id,academic_year_id);
