CREATE TABLE "curriculum_unit_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owning_organization_id" uuid NOT NULL,
	"base_course_version_id" uuid NOT NULL,
	"unit_key" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"module" jsonb NOT NULL,
	"teacher_guide" jsonb,
	"authored_by_person_id" uuid NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"approved_by_person_id" uuid,
	"published_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_unit_adoptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"base_course_version_id" uuid NOT NULL,
	"unit_key" text NOT NULL,
	"unit_version_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"available_at" timestamp with time zone,
	"adopted_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "curriculum_unit_versions" ADD CONSTRAINT "curriculum_unit_versions_owning_organization_id_organizations_id_fk" FOREIGN KEY ("owning_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_unit_versions" ADD CONSTRAINT "curriculum_unit_versions_base_course_version_id_course_template_versions_id_fk" FOREIGN KEY ("base_course_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_unit_versions" ADD CONSTRAINT "curriculum_unit_versions_authored_by_person_id_people_id_fk" FOREIGN KEY ("authored_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_unit_versions" ADD CONSTRAINT "curriculum_unit_versions_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_unit_versions" ADD CONSTRAINT "curriculum_unit_versions_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_unit_adoptions" ADD CONSTRAINT "section_unit_adoptions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_unit_adoptions" ADD CONSTRAINT "section_unit_adoptions_base_course_version_id_course_template_versions_id_fk" FOREIGN KEY ("base_course_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_unit_adoptions" ADD CONSTRAINT "section_unit_adoptions_unit_version_id_curriculum_unit_versions_id_fk" FOREIGN KEY ("unit_version_id") REFERENCES "public"."curriculum_unit_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_unit_adoptions" ADD CONSTRAINT "section_unit_adoptions_adopted_by_person_id_people_id_fk" FOREIGN KEY ("adopted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "curriculum_unit_version_identity_uq" ON "curriculum_unit_versions" USING btree ("base_course_version_id","unit_key","version");--> statement-breakpoint
CREATE INDEX "curriculum_unit_status_idx" ON "curriculum_unit_versions" USING btree ("base_course_version_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "section_unit_adoption_identity_uq" ON "section_unit_adoptions" USING btree ("section_id","unit_key");--> statement-breakpoint
CREATE INDEX "section_unit_adoption_version_idx" ON "section_unit_adoptions" USING btree ("unit_version_id");