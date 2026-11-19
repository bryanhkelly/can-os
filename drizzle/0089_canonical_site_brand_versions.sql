-- CAN OS V6.1: one canonical append-only Site Brand; independently versioned releases.
-- Run a read-only inventory of legacy SiteLocalContent branding before deleting old JSON keys.
CREATE TABLE "site_brand_assets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "data_url" text NOT NULL,
  "checksum" text NOT NULL,
  "alt_text" text NOT NULL,
  "rights_confirmed" text NOT NULL,
  "child_image_consent" text NOT NULL,
  "revoked_at" timestamptz,
  "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_brand_assets_checksum_ck" CHECK ("checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "site_brand_assets_rights_ck" CHECK ("rights_confirmed" IN ('true','false')),
  CONSTRAINT "site_brand_assets_consent_ck" CHECK ("child_image_consent" IN
    ('unconfirmed','no_identifiable_children','guardian_consent_confirmed')),
  CONSTRAINT "site_brand_assets_png_ck" CHECK ("data_url" ~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
    AND length("data_url") <= 220000),
  CONSTRAINT "site_brand_assets_site_id_uq" UNIQUE("site_id","id")
);
CREATE INDEX "site_brand_assets_site_idx" ON "site_brand_assets"("site_id");
--> statement-breakpoint
CREATE TABLE "site_brand_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "revision" integer NOT NULL,
  "configuration" jsonb NOT NULL,
  "fingerprint" text NOT NULL,
  "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_brand_versions_site_revision_uq" UNIQUE("site_id","revision"),
  CONSTRAINT "site_brand_versions_site_id_uq" UNIQUE("site_id","id"),
  CONSTRAINT "site_brand_versions_revision_ck" CHECK ("revision">=1),
  CONSTRAINT "site_brand_versions_fingerprint_ck" CHECK ("fingerprint" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "current_brand_version_id" uuid;
ALTER TABLE "sites" ADD CONSTRAINT "sites_current_brand_same_site_fk"
  FOREIGN KEY ("id","current_brand_version_id") REFERENCES "site_brand_versions"("site_id","id")
  ON DELETE RESTRICT DEFERRABLE INITIALLY IMMEDIATE;
--> statement-breakpoint
ALTER TABLE "site_marketing_packages" ADD COLUMN "brand_version_id" uuid;
ALTER TABLE "site_marketing_packages" ADD CONSTRAINT "site_marketing_packages_site_id_uq" UNIQUE ("site_id","id");
ALTER TABLE "site_marketing_packages" ADD CONSTRAINT "site_marketing_package_brand_scope_fk"
  FOREIGN KEY ("site_id","brand_version_id") REFERENCES "site_brand_versions"("site_id","id")
  ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "site_publications" ADD COLUMN "brand_version_id" uuid;
ALTER TABLE "site_publications" ADD COLUMN "website_content_revision" integer;
ALTER TABLE "site_publications" ADD COLUMN "website_template_id" text;
ALTER TABLE "site_publications" ADD COLUMN "website_template_version" integer;
ALTER TABLE "site_publications" ADD CONSTRAINT "site_publication_brand_scope_fk"
  FOREIGN KEY ("site_id","brand_version_id") REFERENCES "site_brand_versions"("site_id","id")
  ON DELETE RESTRICT;
--> statement-breakpoint
CREATE TABLE "site_artifact_releases" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "site_id" uuid NOT NULL REFERENCES "sites"("id") ON DELETE RESTRICT,
  "package_id" uuid,
  "brand_version_id" uuid NOT NULL REFERENCES "site_brand_versions"("id") ON DELETE RESTRICT,
  "source_package_revision" integer,
  "artifact_kind" text NOT NULL,
  "template_id" text NOT NULL,
  "template_version" integer DEFAULT 1 NOT NULL,
  "content_snapshot" jsonb NOT NULL,
  "asset_manifest" jsonb NOT NULL,
  "output_manifest" jsonb NOT NULL,
  "output_checksum" text NOT NULL,
  "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "site_artifact_releases_package_scope_fk"
    FOREIGN KEY ("site_id","package_id") REFERENCES "site_marketing_packages"("site_id","id") ON DELETE RESTRICT,
  CONSTRAINT "site_artifact_releases_brand_scope_fk"
    FOREIGN KEY ("site_id","brand_version_id") REFERENCES "site_brand_versions"("site_id","id") ON DELETE RESTRICT,
  CONSTRAINT "site_artifact_releases_checksum_ck" CHECK ("output_checksum" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "site_artifact_releases_template_version_ck" CHECK ("template_version">=1)
);
CREATE INDEX "site_artifact_releases_site_idx" ON "site_artifact_releases"("site_id","created_at");
CREATE INDEX "site_artifact_releases_package_idx" ON "site_artifact_releases"("package_id");
--> statement-breakpoint
CREATE TABLE "site_artifact_release_access" (
  "release_id" uuid PRIMARY KEY REFERENCES "site_artifact_releases"("id") ON DELETE RESTRICT,
  "withdrawn_at" timestamptz,
  "withdrawn_reason" text
);
--> statement-breakpoint
-- Append-only configuration and generated outputs. No UPDATE or DELETE even
-- through an elevated server command. Rights withdrawal is a separate state.
CREATE FUNCTION can_site_brand_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Immutable Site Brand records cannot be changed or deleted';
END $$;
CREATE TRIGGER site_brand_versions_immutable
  BEFORE UPDATE OR DELETE ON "site_brand_versions"
  FOR EACH ROW EXECUTE FUNCTION can_site_brand_immutable_guard();
CREATE TRIGGER site_artifact_releases_immutable
  BEFORE UPDATE OR DELETE ON "site_artifact_releases"
  FOR EACH ROW EXECUTE FUNCTION can_site_brand_immutable_guard();
CREATE FUNCTION can_site_brand_asset_immutable_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR
    (to_jsonb(OLD)-'revoked_at') IS DISTINCT FROM (to_jsonb(NEW)-'revoked_at')
 THEN RAISE EXCEPTION 'Immutable Site Brand media cannot be overwritten or deleted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER site_brand_assets_immutable
  BEFORE UPDATE OR DELETE ON "site_brand_assets"
  FOR EACH ROW EXECUTE FUNCTION can_site_brand_asset_immutable_guard();
--> statement-breakpoint
ALTER TABLE "site_brand_assets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_brand_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_artifact_releases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "site_artifact_release_access" ENABLE ROW LEVEL SECURITY;
-- These tables are server-only. Never grant anonymous DB access.
