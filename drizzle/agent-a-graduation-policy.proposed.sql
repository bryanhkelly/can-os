-- Agent A additive migration proposal. Integration coordinator must assign migration number/journal.
ALTER TABLE graduation_requirement_sets ADD COLUMN cohort_start text;
ALTER TABLE graduation_requirement_sets ADD COLUMN cohort_end text;
ALTER TABLE graduation_requirement_sets ADD COLUMN supersedes_requirement_set_id uuid REFERENCES graduation_requirement_sets(id);
ALTER TABLE graduation_requirement_sets ADD COLUMN applicability_reason text;
ALTER TABLE graduation_requirement_sets ADD CONSTRAINT graduation_cohort_bounds_ck CHECK (cohort_start IS NULL OR cohort_end IS NULL OR cohort_start <= cohort_end);
CREATE UNIQUE INDEX graduation_requirement_superseded_once_uq ON graduation_requirement_sets(supersedes_requirement_set_id) WHERE supersedes_requirement_set_id IS NOT NULL;
