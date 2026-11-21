-- Level 1 Site-wide prelaunch interest can exist before an approved Program.
-- Reuse the canonical admissions-interest and follow-up ledger rather than
-- introducing a competing prospect/CRM table. A null program_id is permitted
-- only for Site-level contact requests; any formal Application still requires
-- the existing authenticated Program relationship and separate authorization.
ALTER TABLE public.public_admissions_interests
  ALTER COLUMN program_id DROP NOT NULL;
