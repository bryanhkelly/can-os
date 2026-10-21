CREATE TABLE "curriculum_adoptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid,
	"pack_id" uuid NOT NULL,
	"pack_version_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"adopted_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_entitlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"pack_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"terms_accepted_at" timestamp with time zone NOT NULL,
	"accepted_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_overlays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid,
	"section_id" uuid,
	"course_template_version_id" uuid NOT NULL,
	"lesson_id" text,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"url" text,
	"document_id" uuid,
	"resource_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_pack_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_version_id" uuid NOT NULL,
	"course_template_version_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_pack_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pack_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publisher_organization_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"license_code" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"format" text NOT NULL,
	"format_version" text NOT NULL,
	"source_name" text NOT NULL,
	"sha256" text NOT NULL,
	"status" text DEFAULT 'staged' NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_interop_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"import_job_id" uuid,
	"format" text NOT NULL,
	"source_system" text NOT NULL,
	"external_identifier" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_resource_bindings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resource_id" uuid NOT NULL,
	"pack_version_id" uuid NOT NULL,
	"course_template_version_id" uuid,
	"lesson_id" text,
	"placement" text DEFAULT 'supplemental' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "curriculum_resources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_organization_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"document_id" uuid,
	"license_code" text NOT NULL,
	"attribution" text,
	"source_url" text,
	"source_format" text,
	"source_identifier" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_resource_exactly_one_location_ck" CHECK ((("curriculum_resources"."url" IS NOT NULL)::int + ("curriculum_resources"."document_id" IS NOT NULL)::int) = 1)
);
--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_pack_id_curriculum_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curriculum_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_pack_version_id_curriculum_pack_versions_id_fk" FOREIGN KEY ("pack_version_id") REFERENCES "public"."curriculum_pack_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_adoptions" ADD CONSTRAINT "curriculum_adoptions_adopted_by_person_id_people_id_fk" FOREIGN KEY ("adopted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_entitlements" ADD CONSTRAINT "curriculum_entitlements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_entitlements" ADD CONSTRAINT "curriculum_entitlements_pack_id_curriculum_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curriculum_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_entitlements" ADD CONSTRAINT "curriculum_entitlements_accepted_by_person_id_people_id_fk" FOREIGN KEY ("accepted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_overlays" ADD CONSTRAINT "curriculum_overlays_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_pack_items" ADD CONSTRAINT "curriculum_pack_items_pack_version_id_curriculum_pack_versions_id_fk" FOREIGN KEY ("pack_version_id") REFERENCES "public"."curriculum_pack_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_pack_items" ADD CONSTRAINT "curriculum_pack_items_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_pack_versions" ADD CONSTRAINT "curriculum_pack_versions_pack_id_curriculum_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."curriculum_packs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_packs" ADD CONSTRAINT "curriculum_packs_publisher_organization_id_organizations_id_fk" FOREIGN KEY ("publisher_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_import_jobs" ADD CONSTRAINT "curriculum_import_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_interop_mappings" ADD CONSTRAINT "curriculum_interop_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_interop_mappings" ADD CONSTRAINT "curriculum_interop_mappings_import_job_id_curriculum_import_jobs_id_fk" FOREIGN KEY ("import_job_id") REFERENCES "public"."curriculum_import_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_resource_bindings" ADD CONSTRAINT "curriculum_resource_bindings_resource_id_curriculum_resources_id_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."curriculum_resources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_resource_bindings" ADD CONSTRAINT "curriculum_resource_bindings_pack_version_id_curriculum_pack_versions_id_fk" FOREIGN KEY ("pack_version_id") REFERENCES "public"."curriculum_pack_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_resource_bindings" ADD CONSTRAINT "curriculum_resource_bindings_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_resources" ADD CONSTRAINT "curriculum_resources_owner_organization_id_organizations_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_resources" ADD CONSTRAINT "curriculum_resources_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_adoption_program_pack_uq" ON "curriculum_adoptions" USING btree ("program_id","pack_id");--> statement-breakpoint
CREATE INDEX "curriculum_adoption_org_idx" ON "curriculum_adoptions" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_entitlement_org_pack_uq" ON "curriculum_entitlements" USING btree ("organization_id","pack_id");--> statement-breakpoint
CREATE INDEX "curriculum_overlay_course_scope_idx" ON "curriculum_overlays" USING btree ("course_template_version_id","program_id");--> statement-breakpoint
CREATE INDEX "curriculum_overlay_section_idx" ON "curriculum_overlays" USING btree ("section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_pack_item_version_course_uq" ON "curriculum_pack_items" USING btree ("pack_version_id","course_template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_pack_item_order_uq" ON "curriculum_pack_items" USING btree ("pack_version_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_pack_version_uq" ON "curriculum_pack_versions" USING btree ("pack_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_pack_publisher_slug_uq" ON "curriculum_packs" USING btree ("publisher_organization_id","slug");--> statement-breakpoint
CREATE INDEX "curriculum_pack_visibility_idx" ON "curriculum_packs" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "curriculum_import_jobs_org_idx" ON "curriculum_import_jobs" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_import_job_source_uq" ON "curriculum_import_jobs" USING btree ("organization_id","format","sha256");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_interop_external_uq" ON "curriculum_interop_mappings" USING btree ("organization_id","format","source_system","external_identifier");--> statement-breakpoint
CREATE INDEX "curriculum_interop_internal_idx" ON "curriculum_interop_mappings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "curriculum_resource_binding_pack_idx" ON "curriculum_resource_bindings" USING btree ("pack_version_id");--> statement-breakpoint
CREATE INDEX "curriculum_resource_binding_course_idx" ON "curriculum_resource_bindings" USING btree ("course_template_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_resource_binding_unique_idx" ON "curriculum_resource_bindings" USING btree ("pack_version_id","resource_id","course_template_version_id","lesson_id");--> statement-breakpoint
CREATE INDEX "curriculum_resources_owner_idx" ON "curriculum_resources" USING btree ("owner_organization_id");--> statement-breakpoint
CREATE INDEX "curriculum_resources_source_idx" ON "curriculum_resources" USING btree ("source_format","source_identifier");