-- 0106: universal engagement registry and immutable versions.
-- Existing Site Go Links remain valid. Platform/Organization/Program experiences
-- may now own links without manufacturing Site or Marketing Package records.
CREATE TABLE "public"."engagement_definitions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "owner_kind" text NOT NULL,
  "organization_id" uuid REFERENCES "public"."organizations"("id") ON DELETE RESTRICT,
  "site_id" uuid REFERENCES "public"."sites"("id") ON DELETE RESTRICT,
  "program_id" uuid REFERENCES "public"."programs"("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'active',
  "created_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "engagement_definitions_owner_ck" CHECK (
    (owner_kind='platform' AND organization_id IS NULL AND site_id IS NULL AND program_id IS NULL)
    OR (owner_kind='organization' AND organization_id IS NOT NULL AND site_id IS NULL AND program_id IS NULL)
    OR (owner_kind='site' AND organization_id IS NOT NULL AND site_id IS NOT NULL AND program_id IS NULL)
    OR (owner_kind='program' AND organization_id IS NOT NULL AND program_id IS NOT NULL)
  ),
  CONSTRAINT "engagement_definitions_status_ck" CHECK (status IN ('active','retired'))
);
CREATE INDEX "engagement_definitions_org_idx" ON "public"."engagement_definitions" ("organization_id","created_at");
CREATE INDEX "engagement_definitions_site_idx" ON "public"."engagement_definitions" ("site_id","created_at");
--> statement-breakpoint
CREATE TABLE "public"."engagement_definition_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "engagement_id" uuid NOT NULL REFERENCES "public"."engagement_definitions"("id") ON DELETE RESTRICT,
  "version" integer NOT NULL,
  "content" jsonb NOT NULL,
  "published_at" timestamptz NOT NULL DEFAULT now(),
  "created_by_person_id" uuid NOT NULL REFERENCES "public"."people"("id") ON DELETE RESTRICT,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "engagement_definition_versions_positive_ck" CHECK (version >= 1),
  CONSTRAINT "engagement_definition_versions_content_ck" CHECK (jsonb_typeof(content) = 'object'),
  CONSTRAINT "engagement_definition_versions_number_uq" UNIQUE ("engagement_id","version")
);
CREATE INDEX "engagement_definition_versions_engagement_idx" ON "public"."engagement_definition_versions" ("engagement_id","published_at");
--> statement-breakpoint
-- Public visitors only access /go; no client direct database write.
ALTER TABLE "public"."site_go_links" ALTER COLUMN "organization_id" DROP NOT NULL;
ALTER TABLE "public"."site_go_links" ALTER COLUMN "site_id" DROP NOT NULL;
ALTER TABLE "public"."site_go_links" ALTER COLUMN "package_id" DROP NOT NULL;
ALTER TABLE "public"."site_go_links" ALTER COLUMN "destination" DROP NOT NULL;
ALTER TABLE "public"."site_go_links" ADD COLUMN "engagement_version_id" uuid REFERENCES "public"."engagement_definition_versions"("id") ON DELETE RESTRICT;
ALTER TABLE "public"."site_go_links" ADD COLUMN "channel" text;
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_resolution_ck" CHECK (
  (engagement_version_id IS NULL AND destination IS NOT NULL
    AND organization_id IS NOT NULL AND site_id IS NOT NULL AND package_id IS NOT NULL)
  OR (engagement_version_id IS NOT NULL AND destination IS NULL)
);
ALTER TABLE "public"."site_go_links" ADD CONSTRAINT "site_go_links_channel_ck"
  CHECK (channel IS NULL OR channel IN ('email','sms','qr','social','partner','web','other'));
CREATE INDEX "site_go_links_engagement_idx" ON "public"."site_go_links" ("engagement_version_id","created_at");
--> statement-breakpoint
-- DB-level protection for immutable published content.
CREATE FUNCTION "public"."reject_engagement_version_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published engagement versions are immutable';
END $$;
CREATE TRIGGER "engagement_versions_immutable_update"
  BEFORE UPDATE OR DELETE ON "public"."engagement_definition_versions"
  FOR EACH ROW EXECUTE FUNCTION "public"."reject_engagement_version_mutation"();
--> statement-breakpoint
REVOKE ALL ON "public"."engagement_definitions" FROM PUBLIC;
REVOKE ALL ON "public"."engagement_definition_versions" FROM PUBLIC;
