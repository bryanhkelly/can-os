-- Academic marketing approvals are independent of Program launch/admissions.
-- Never imply accreditation, credit issuance, or enrollment readiness.
CREATE TABLE IF NOT EXISTS "program_publications" (
  "program_id" uuid PRIMARY KEY NOT NULL REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "summary" text NOT NULL,
  "grade_range" jsonb NOT NULL,
  "delivery_model" jsonb NOT NULL,
  "approved_by_person_id" uuid REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "published_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "program_publications_status_ck" CHECK ("status" IN ('draft', 'published')),
  CONSTRAINT "program_publications_published_ck" CHECK (
    ("status" = 'draft' AND "published_at" IS NULL) OR
    ("status" = 'published' AND "published_at" IS NOT NULL AND "approved_by_person_id" IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "program_publications_site_status_idx"
  ON "program_publications" ("site_id", "status");
