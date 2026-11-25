-- Preserve universal engagement resolution, while allowing direct Site-owned
-- navigation without manufacturing a Marketing Package.
ALTER TABLE "public"."site_go_links"
  ALTER COLUMN "package_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "public"."site_go_links"
  ADD COLUMN IF NOT EXISTS "request_id" uuid,
  ADD COLUMN IF NOT EXISTS "request_fingerprint" text;
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" DROP CONSTRAINT IF EXISTS "site_go_links_resolution_ck";
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_resolution_ck"
  CHECK (
    ("engagement_version_id" IS NOT NULL AND "destination" IS NULL)
    OR ("engagement_version_id" IS NULL AND "destination" IS NOT NULL
        AND "organization_id" IS NOT NULL AND "site_id" IS NOT NULL)
  );
--> statement-breakpoint
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_request_fingerprint_ck"
  CHECK (("request_id" IS NULL AND "request_fingerprint" IS NULL) OR
         ("request_id" IS NOT NULL AND "request_fingerprint" ~ '^[0-9a-f]{64}$'));
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_go_links_request_uq"
  ON "public"."site_go_links" ("site_id","created_by_person_id","request_id")
  WHERE "request_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "site_go_links_site_page_idx"
  ON "public"."site_go_links" ("site_id","created_at" DESC,"id" DESC);
