-- Anonymous inquiries remain outside applications until identity and
-- guardian relationships are verified in the existing registrar intake.
CREATE TABLE IF NOT EXISTS "public_admissions_interests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "request_id" uuid NOT NULL,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "program_id" uuid NOT NULL REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "contact_first_name" text NOT NULL,
  "contact_last_name" text NOT NULL,
  "contact_email" text NOT NULL,
  "email_digest" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'new',
  "contacted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "public_admissions_interests_status_ck" CHECK ("status" IN ('new', 'contacted', 'closed'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "public_admissions_interests_request_uq"
  ON "public_admissions_interests" ("request_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_admissions_interests_program_idx"
  ON "public_admissions_interests" ("program_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "public_admissions_interests_contact_idx"
  ON "public_admissions_interests" ("program_id", "email_digest", "created_at");
