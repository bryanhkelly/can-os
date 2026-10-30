ALTER TABLE section_teachers ADD COLUMN IF NOT EXISTS assignment_source text NOT NULL DEFAULT 'manual';
