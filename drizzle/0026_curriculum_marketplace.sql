-- CAN curriculum marketplace (additive, existing academic and document entities remain authoritative).
CREATE TABLE IF NOT EXISTS "curriculum_packs" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "publisher_organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
 "slug" text NOT NULL, "name" text NOT NULL, "description" text NOT NULL,
 "visibility" text DEFAULT 'private' NOT NULL, "license_code" text NOT NULL,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "curriculum_pack_publisher_slug_uq" UNIQUE ("publisher_organization_id","slug"),
 CONSTRAINT "curriculum_pack_visibility_ck" CHECK (visibility IN ('public','private'))
);
CREATE INDEX IF NOT EXISTS "curriculum_pack_visibility_idx" ON "curriculum_packs"("visibility");
CREATE TABLE IF NOT EXISTS "curriculum_pack_versions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "pack_id" uuid NOT NULL REFERENCES "curriculum_packs"("id") ON DELETE RESTRICT,
 "version" integer NOT NULL, "status" text DEFAULT 'draft' NOT NULL,
 "published_at" timestamptz, "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "curriculum_pack_version_uq" UNIQUE ("pack_id","version"),
 CONSTRAINT "curriculum_pack_version_status_ck" CHECK (status IN ('draft','published','retired')),
 CONSTRAINT "curriculum_pack_published_at_ck" CHECK (status <> 'published' OR published_at IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS "curriculum_pack_items" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "pack_version_id" uuid NOT NULL REFERENCES "curriculum_pack_versions"("id") ON DELETE RESTRICT,
 "course_template_version_id" uuid NOT NULL REFERENCES "course_template_versions"("id") ON DELETE RESTRICT,
 "position" integer NOT NULL CHECK (position>=0),
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 CONSTRAINT "curriculum_pack_item_version_course_uq" UNIQUE ("pack_version_id","course_template_version_id"),
 CONSTRAINT "curriculum_pack_item_order_uq" UNIQUE ("pack_version_id","position")
);
CREATE TABLE IF NOT EXISTS "curriculum_entitlements" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
 "pack_id" uuid NOT NULL REFERENCES "curriculum_packs"("id") ON DELETE RESTRICT,
 "status" text DEFAULT 'active' NOT NULL CHECK (status IN ('active','revoked')),
 "terms_accepted_at" timestamptz NOT NULL,
 "accepted_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "curriculum_entitlement_org_pack_uq" UNIQUE ("organization_id","pack_id")
);
CREATE TABLE IF NOT EXISTS "curriculum_adoptions" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
 "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE RESTRICT,
 "site_id" uuid REFERENCES "sites"("id") ON DELETE RESTRICT,
 "pack_id" uuid NOT NULL REFERENCES "curriculum_packs"("id") ON DELETE RESTRICT,
 "pack_version_id" uuid NOT NULL REFERENCES "curriculum_pack_versions"("id") ON DELETE RESTRICT,
 "status" text DEFAULT 'active' NOT NULL CHECK (status IN ('active','inactive')),
 "adopted_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "curriculum_adoption_program_pack_uq" UNIQUE ("program_id","pack_id")
);
CREATE INDEX IF NOT EXISTS "curriculum_adoption_org_idx" ON "curriculum_adoptions"("organization_id");
CREATE TABLE IF NOT EXISTS "curriculum_overlays" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE RESTRICT,
 "program_id" uuid NOT NULL REFERENCES "programs"("id") ON DELETE RESTRICT,
 "site_id" uuid REFERENCES "sites"("id") ON DELETE RESTRICT,
 "section_id" uuid REFERENCES "sections"("id") ON DELETE RESTRICT,
 "course_template_version_id" uuid NOT NULL REFERENCES "course_template_versions"("id") ON DELETE RESTRICT,
 "lesson_id" text,
 "title" text NOT NULL, "kind" text NOT NULL CHECK (kind IN ('link','video','pdf','image','audio','document')),
 "url" text, "document_id" uuid REFERENCES "documents"("id") ON DELETE RESTRICT,
 "status" text DEFAULT 'active' NOT NULL CHECK (status IN ('active','hidden')),
 "created_by_person_id" uuid NOT NULL REFERENCES "people"("id") ON DELETE RESTRICT,
 "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
 "created_at" timestamptz DEFAULT now() NOT NULL, "updated_at" timestamptz DEFAULT now() NOT NULL,
 CONSTRAINT "curriculum_overlay_resource_ck" CHECK ((url IS NOT NULL AND document_id IS NULL) OR (url IS NULL AND document_id IS NOT NULL)),
 CONSTRAINT "curriculum_overlay_http_ck" CHECK (url IS NULL OR url ~ '^https://[^[:space:]]+$')
);
CREATE INDEX IF NOT EXISTS "curriculum_overlay_course_scope_idx" ON "curriculum_overlays"("course_template_version_id","program_id");
CREATE INDEX IF NOT EXISTS "curriculum_overlay_section_idx" ON "curriculum_overlays"("section_id");
