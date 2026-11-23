-- Public, revocable short navigation links bound to one Site and outreach package.
-- These links grant NO enrollment, guardian, staff or other identity privileges.
CREATE TABLE IF NOT EXISTS "public"."site_go_links" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "site_id" uuid NOT NULL REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "package_id" uuid NOT NULL REFERENCES "public"."site_marketing_packages"("id") ON DELETE RESTRICT,
  "created_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "destination" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "site_go_links_code_ck" CHECK (length("code") = 12 AND "code" ~ '^[A-Za-z0-9_-]+$'),
  CONSTRAINT "site_go_links_status_ck" CHECK ("status" IN ('active','revoked')),
  CONSTRAINT "site_go_links_destination_ck" CHECK (jsonb_typeof("destination") = 'object')
);
CREATE UNIQUE INDEX IF NOT EXISTS "site_go_links_code_uq" ON "public"."site_go_links" ("code");
CREATE INDEX IF NOT EXISTS "site_go_links_package_idx" ON "public"."site_go_links" ("site_id", "package_id", "created_at");
-- Direct anonymous database access is not part of the public /go interface.
REVOKE ALL ON TABLE "public"."site_go_links" FROM PUBLIC;
