-- Add cohort applicability fields without guessing legacy student or policy cohorts.
-- Existing NULL-cohort policies remain unresolved until explicit issuer registrar review.
ALTER TABLE "graduation_requirement_sets" ADD COLUMN "cohort_start" text;--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD COLUMN "cohort_end" text;--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD COLUMN "supersedes_requirement_set_id" uuid;--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD COLUMN "applicability_reason" text;--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD CONSTRAINT "graduation_requirement_sets_supersedes_requirement_set_id_graduation_requirement_sets_id_fk" FOREIGN KEY ("supersedes_requirement_set_id") REFERENCES "public"."graduation_requirement_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD CONSTRAINT "graduation_cohort_bounds_ck" CHECK (
  (cohort_start IS NULL AND cohort_end IS NULL)
  OR (cohort_start IS NOT NULL AND cohort_end IS NOT NULL
      AND cohort_start ~ '^[0-9]{4}
);--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD CONSTRAINT "graduation_supersession_not_self_ck" CHECK (supersedes_requirement_set_id IS NULL OR supersedes_requirement_set_id <> id);--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_requirement_superseded_once_uq" ON "graduation_requirement_sets" ("supersedes_requirement_set_id") WHERE "supersedes_requirement_set_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "graduation_requirement_cohort_lookup_idx" ON "graduation_requirement_sets" ("issuing_organization_id", "cohort_start", "cohort_end");
 AND cohort_end ~ '^[0-9]{4}
);--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD CONSTRAINT "graduation_supersession_not_self_ck" CHECK (supersedes_requirement_set_id IS NULL OR supersedes_requirement_set_id <> id);--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_requirement_superseded_once_uq" ON "graduation_requirement_sets" ("supersedes_requirement_set_id") WHERE "supersedes_requirement_set_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "graduation_requirement_cohort_lookup_idx" ON "graduation_requirement_sets" ("issuing_organization_id", "cohort_start", "cohort_end");

      AND cohort_start <= cohort_end)
);--> statement-breakpoint
ALTER TABLE "graduation_requirement_sets" ADD CONSTRAINT "graduation_supersession_not_self_ck" CHECK (supersedes_requirement_set_id IS NULL OR supersedes_requirement_set_id <> id);--> statement-breakpoint
CREATE UNIQUE INDEX "graduation_requirement_superseded_once_uq" ON "graduation_requirement_sets" ("supersedes_requirement_set_id") WHERE "supersedes_requirement_set_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "graduation_requirement_cohort_lookup_idx" ON "graduation_requirement_sets" ("issuing_organization_id", "cohort_start", "cohort_end");
