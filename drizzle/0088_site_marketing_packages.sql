-- Introduce / Promote: brand-independent, Site-scoped package drafts.
-- No second Site brand, distribution infrastructure or recipient database.
CREATE TABLE IF NOT EXISTS "site_marketing_packages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
  "title" text NOT NULL,
  "content" jsonb NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_marketing_packages_revision_ck" CHECK ("revision" >= 1),
  CONSTRAINT "site_marketing_packages_status_ck" CHECK ("status" IN ('draft','archived'))
);
CREATE INDEX IF NOT EXISTS "site_marketing_packages_site_status_idx"
  ON "site_marketing_packages"("site_id","status","updated_at");
-- All application access must use server-side Site grant checks.
ALTER TABLE "site_marketing_packages" ENABLE ROW LEVEL SECURITY;
