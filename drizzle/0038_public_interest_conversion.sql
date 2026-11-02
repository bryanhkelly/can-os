-- Link a registrar-reviewed public lead to exactly one existing GF22
-- Application. Conversion is performed atomically by createAdmissionsInquiry.
ALTER TABLE "public_admissions_interests"
  ADD COLUMN "application_id" uuid REFERENCES "public"."applications"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  ADD COLUMN "converted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  ADD COLUMN "converted_by_person_id" uuid REFERENCES "public"."people"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  DROP CONSTRAINT "public_admissions_interests_status_ck";
--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  ADD CONSTRAINT "public_admissions_interests_status_ck"
  CHECK ("status" IN ('new', 'contacted', 'closed', 'converted'));
--> statement-breakpoint
ALTER TABLE "public_admissions_interests"
  ADD CONSTRAINT "public_admissions_interests_conversion_ck"
  CHECK (
    ("status" = 'converted' AND "application_id" IS NOT NULL
      AND "converted_at" IS NOT NULL AND "converted_by_person_id" IS NOT NULL)
    OR
    ("status" <> 'converted' AND "application_id" IS NULL
      AND "converted_at" IS NULL AND "converted_by_person_id" IS NULL)
  );
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_admissions_interests_application_uq"
  ON "public_admissions_interests" ("application_id");
