-- Interoperability first: normalize reusable resources and preserve external source identities.
CREATE TABLE "curriculum_resources" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "owner_organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 "kind" text NOT NULL CHECK (kind IN ('link','video','pdf','image','audio','document','assessment','lti_tool','other')),
 "title" text NOT NULL, "url" text, "document_id" uuid REFERENCES documents(id) ON DELETE RESTRICT,
 "license_code" text NOT NULL, "attribution" text, "source_url" text, "source_format" text,
 "source_identifier" text, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "curriculum_resource_exactly_one_location_ck" CHECK (((url IS NOT NULL)::integer + (document_id IS NOT NULL)::integer) = 1),
 CONSTRAINT "curriculum_resource_safe_url_ck" CHECK (url IS NULL OR url ~ '^https://[^[:space:]]+$')
);
CREATE INDEX "curriculum_resources_owner_idx" ON curriculum_resources(owner_organization_id);
CREATE INDEX "curriculum_resources_source_idx" ON curriculum_resources(source_format,source_identifier);

CREATE TABLE "curriculum_resource_bindings" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "resource_id" uuid NOT NULL REFERENCES curriculum_resources(id) ON DELETE RESTRICT,
 "pack_version_id" uuid NOT NULL REFERENCES curriculum_pack_versions(id) ON DELETE RESTRICT,
 "course_template_version_id" uuid REFERENCES course_template_versions(id) ON DELETE RESTRICT,
 "lesson_id" text,"placement" text NOT NULL DEFAULT 'supplemental',
 "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX "curriculum_resource_binding_pack_idx" ON curriculum_resource_bindings(pack_version_id);
CREATE INDEX "curriculum_resource_binding_course_idx" ON curriculum_resource_bindings(course_template_version_id);
CREATE UNIQUE INDEX "curriculum_resource_binding_unique_idx"
 ON curriculum_resource_bindings(pack_version_id,resource_id,course_template_version_id,lesson_id);

CREATE TABLE "curriculum_import_jobs" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 "format" text NOT NULL CHECK(format IN ('common_cartridge','thin_common_cartridge','qti','oneroster','lti','can_native')),
 "format_version" text NOT NULL, "source_name" text NOT NULL,
 "sha256" text NOT NULL, "status" text NOT NULL DEFAULT 'staged'
 CHECK(status IN ('staged','validated','rejected','imported')),
 "report" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "curriculum_import_job_source_uq" UNIQUE(organization_id,format,sha256)
);
CREATE INDEX "curriculum_import_jobs_org_idx" ON curriculum_import_jobs(organization_id);

CREATE TABLE "curriculum_interop_mappings" (
 "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
 "organization_id" uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
 "import_job_id" uuid REFERENCES curriculum_import_jobs(id) ON DELETE RESTRICT,
 "format" text NOT NULL, "source_system" text NOT NULL, "external_identifier" text NOT NULL,
 "entity_type" text NOT NULL, "entity_id" uuid NOT NULL,
 "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
 "created_at" timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT "curriculum_interop_external_uq" UNIQUE(organization_id,format,source_system,external_identifier)
);
CREATE INDEX "curriculum_interop_internal_idx" ON curriculum_interop_mappings(entity_type,entity_id);
-- Existing local overlays become links to canonical resources rather than duplicating assets.
ALTER TABLE curriculum_overlays ADD COLUMN resource_id uuid REFERENCES curriculum_resources(id) ON DELETE RESTRICT;
ALTER TABLE curriculum_overlays DROP CONSTRAINT IF EXISTS curriculum_overlay_resource_ck;
ALTER TABLE curriculum_overlays ADD CONSTRAINT curriculum_overlay_resource_ck
 CHECK (((url IS NOT NULL)::integer + (document_id IS NOT NULL)::integer + (resource_id IS NOT NULL)::integer)=1);
