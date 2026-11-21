-- Level 1 Site-wide prelaunch interest can exist before an approved Program.
-- Reuse the canonical admissions-interest and follow-up ledger rather than
-- introducing a competing prospect/CRM table. A null program_id is permitted
-- only for Site-level contact requests; any formal Application still requires
-- the existing authenticated Program relationship and separate authorization.
ALTER TABLE public.public_admissions_interests
  ALTER COLUMN program_id DROP NOT NULL;
--> statement-breakpoint
-- A record without a Program must be an adult-only Site interest. Never allow
-- a converted Application, family verification challenge or imported contact
-- to be represented as a Program-less inquiry.
ALTER TABLE public.public_admissions_interests
  ADD CONSTRAINT public_site_interest_program_scope_ck CHECK (
    program_id IS NOT NULL OR (
      source = 'published_site_general'
      AND application_id IS NULL
      AND family_start_request_id IS NULL
      AND invitation_batch_id IS NULL
      AND invitation_recipient_key IS NULL
      AND converted_at IS NULL
      AND converted_by_person_id IS NULL
      AND status IN ('new', 'contacted', 'closed')
    )
  );
