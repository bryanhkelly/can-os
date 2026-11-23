-- Preserve the Organization category selected during verified Site signup.
-- Historical pending records become neutral other_partner, never christian_school by assumption.
-- National/consortium self-description stays provisional until independently verified.
ALTER TABLE "school_setup_signups"
  ADD COLUMN IF NOT EXISTS "organization_type" text NOT NULL DEFAULT 'other_partner';
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'school_setup_signup_organization_type_ck') THEN
  ALTER TABLE "school_setup_signups" ADD CONSTRAINT "school_setup_signup_organization_type_ck"
  CHECK ("organization_type" IN ('other_partner','church','christian_school','microschool_operator','consortium','denomination'));
 END IF;
END $$;
