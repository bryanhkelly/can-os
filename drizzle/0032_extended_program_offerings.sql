-- Keep summer_enrichment for existing programs; add new offering types.
ALTER TYPE "public"."program_type" ADD VALUE IF NOT EXISTS 'summer_program';
--> statement-breakpoint
ALTER TYPE "public"."program_type" ADD VALUE IF NOT EXISTS 'after_school_enrichment';
--> statement-breakpoint
-- Noncredit programs must not have a fabricated credit-issuing institution.
ALTER TABLE "programs" ALTER COLUMN "credit_issuing_organization_id" DROP NOT NULL;
