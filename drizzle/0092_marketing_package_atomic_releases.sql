-- Introduce V6.1: one immutable Package Release, with all selected output
-- records inserted atomically. Older stand-alone artifact releases remain
-- intact with package_release_id NULL and remain available as legacy history.
CREATE TABLE "site_marketing_package_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "package_id" uuid NOT NULL,
  "release_number" integer NOT NULL,
  "request_id" uuid NOT NULL,
  "brand_version_id" uuid NOT NULL REFERENCES "site_brand_versions"("id") ON DELETE RESTRICT,
  "source_package_revision" integer NOT NULL,
  "content_snapshot" jsonb NOT NULL,
  "formats" jsonb NOT NULL,
  "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "site_marketing_package_releases_package_scope_fk"
    FOREIGN KEY ("site_id","package_id") REFERENCES "site_marketing_packages"("site_id","id") ON DELETE RESTRICT,
  CONSTRAINT "site_marketing_package_releases_brand_scope_fk"
    FOREIGN KEY ("site_id","brand_version_id") REFERENCES "site_brand_versions"("site_id","id") ON DELETE RESTRICT,
  CONSTRAINT "site_marketing_package_releases_number_uq" UNIQUE ("package_id","release_number"),
  CONSTRAINT "site_marketing_package_releases_request_uq" UNIQUE ("package_id","request_id"),
  CONSTRAINT "site_marketing_package_releases_site_id_uq" UNIQUE ("site_id","id"),
  CONSTRAINT "site_marketing_package_releases_scope_uq" UNIQUE ("site_id","package_id","id"),
  CONSTRAINT "site_marketing_package_releases_number_ck" CHECK ("release_number" >= 1),
  CONSTRAINT "site_marketing_package_releases_source_revision_ck" CHECK ("source_package_revision" >= 1),
  CONSTRAINT "site_marketing_package_releases_formats_ck" CHECK (
    jsonb_typeof("formats") = 'array' AND jsonb_array_length("formats") BETWEEN 1 AND 5
  )
);
--> statement-breakpoint
CREATE INDEX "site_marketing_package_releases_site_idx"
  ON "site_marketing_package_releases"("site_id","created_at");
--> statement-breakpoint
ALTER TABLE "site_artifact_releases" ADD COLUMN "package_release_id" uuid;
--> statement-breakpoint
ALTER TABLE "site_artifact_releases" ADD CONSTRAINT "site_artifact_releases_package_release_scope_fk"
  FOREIGN KEY ("site_id","package_id","package_release_id")
  REFERENCES "site_marketing_package_releases"("site_id","package_id","id") ON DELETE RESTRICT;
ALTER TABLE "site_artifact_releases" ADD CONSTRAINT "site_artifact_releases_package_parent_ck"
  CHECK ("package_release_id" IS NULL OR "package_id" IS NOT NULL);
--> statement-breakpoint
CREATE INDEX "site_artifact_releases_package_release_idx"
  ON "site_artifact_releases"("package_release_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "site_artifact_releases_one_format_per_package_release_uq"
  ON "site_artifact_releases"("package_release_id","artifact_kind")
  WHERE "package_release_id" IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER site_marketing_package_releases_immutable
  BEFORE UPDATE OR DELETE ON "site_marketing_package_releases"
  FOR EACH ROW EXECUTE FUNCTION can_site_brand_immutable_guard();
--> statement-breakpoint
ALTER TABLE "site_marketing_package_releases" ENABLE ROW LEVEL SECURITY;
-- Data access stays behind existing server-side Site grant checks.
-- Never expose this table or its output snapshots to anonymous roles.
