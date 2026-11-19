-- Persist a distinct responsible Organization display name during verified Site signup.
-- This field cannot authorize a host, legal affiliation, or opening readiness.
ALTER TABLE "school_setup_signups" ADD COLUMN IF NOT EXISTS "organization_name" text;
