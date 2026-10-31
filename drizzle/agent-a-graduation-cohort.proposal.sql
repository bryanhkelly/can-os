-- Agent A proposal: coordinator assigns a unique migration tag and applies to an ISOLATED database.
-- Do not apply blindly to shared instances; legacy rows are intentionally unclassified.
ALTER TABLE graduation_requirement_sets ADD COLUMN cohort_start text;
ALTER TABLE graduation_requirement_sets ADD COLUMN cohort_end text;
ALTER TABLE graduation_requirement_sets ADD COLUMN supersedes_requirement_set_id uuid REFERENCES graduation_requirement_sets(id);
ALTER TABLE graduation_requirement_sets ADD COLUMN applicability_reason text;
ALTER TABLE graduation_requirement_sets
 ADD CONSTRAINT graduation_cohort_bounds_ck CHECK (
   (cohort_start IS NULL AND cohort_end IS NULL) OR
   (cohort_start ~ '^[0-9]{4}$' AND cohort_end ~ '^[0-9]{4}$' AND cohort_start <= cohort_end)
 );
ALTER TABLE graduation_requirement_sets
 ADD CONSTRAINT graduation_supersession_not_self_ck CHECK (
   supersedes_requirement_set_id IS NULL OR supersedes_requirement_set_id <> id
 );
CREATE UNIQUE INDEX graduation_requirement_superseded_once_uq
 ON graduation_requirement_sets(supersedes_requirement_set_id)
 WHERE supersedes_requirement_set_id IS NOT NULL;
CREATE INDEX graduation_requirement_cohort_lookup_idx
 ON graduation_requirement_sets(issuing_organization_id,cohort_start,cohort_end);
-- Migration/backfill must not infer cohorts from academic_year:
-- 1. enumerate each issuer's legacy NULL-cohort policy and existing diplomas.
-- 2. have issuing registrar approve applicability evidence and cohort bounds.
-- 3. verify no active overlap, record approval/audit reference, and update each legacy row.
-- 4. mark supersession links only after reconciling earlier graduate decisions.
-- 5. leave unresolved rows NULL; adjudication must fail closed for them.
