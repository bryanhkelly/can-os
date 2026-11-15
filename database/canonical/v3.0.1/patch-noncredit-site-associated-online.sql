-- CAN OS: Site identity is distinct from classroom modality.
-- A Site may be physical/virtual/mobile and may present independent online
-- learning without hosting an in-person facilitated cohort.
--
-- Upgrades the former rule, which required site_id IS NULL for independent.
-- Existing rows remain valid and neither enrollment authority nor membership
-- is granted by this schema-only change.
BEGIN;
ALTER TABLE education_v30.noncredit_self_enrollment_releases
  ADD CONSTRAINT noncredit_self_enroll_site_flexible_ck
  CHECK (delivery_mode = 'independent' OR
         (delivery_mode = 'facilitated' AND site_id IS NOT NULL)) NOT VALID;
ALTER TABLE education_v30.noncredit_self_enrollment_releases
  VALIDATE CONSTRAINT noncredit_self_enroll_site_flexible_ck;
ALTER TABLE education_v30.noncredit_self_enrollment_releases
  DROP CONSTRAINT noncredit_self_enroll_site_ck;
ALTER TABLE education_v30.noncredit_self_enrollment_releases
  RENAME CONSTRAINT noncredit_self_enroll_site_flexible_ck TO noncredit_self_enroll_site_ck;
COMMIT;
-- Runtime service must still independently check current Site status,
-- operation/Site relationship, registering organization role, adoption,
-- course release, and consent. A Site ID alone never authorizes publication.
