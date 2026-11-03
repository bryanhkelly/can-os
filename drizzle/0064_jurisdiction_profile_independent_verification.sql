CREATE TABLE IF NOT EXISTS "curriculum_jurisdiction_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_template_version_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"academic_purpose" text NOT NULL,
	"status" text NOT NULL,
	"authority_organization_id" uuid,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_jurisdiction_approvals_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "curriculum_jurisdiction_approvals_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "curriculum_jurisdiction_approvals_authority_organization_id_organizations_id_fk" FOREIGN KEY ("authority_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jurisdiction_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"revision" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"review_owner_person_id" uuid,
	"last_edited_by_person_id" uuid,
	"verified_by_person_id" uuid,
	"verification_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"reviewed_at" timestamp with time zone,
	"next_review_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"content_schema_version" text DEFAULT '1' NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"effective_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jurisdiction_profile_versions_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "jurisdiction_profile_versions_last_edited_by_person_id_people_id_fk" FOREIGN KEY ("last_edited_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "jurisdiction_profile_versions_verified_by_person_id_people_id_fk" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "jurisdiction_profile_versions" ADD COLUMN IF NOT EXISTS "last_edited_by_person_id" uuid;
--> statement-breakpoint
ALTER TABLE "jurisdiction_profile_versions" ADD COLUMN IF NOT EXISTS "verified_by_person_id" uuid;
--> statement-breakpoint
ALTER TABLE "jurisdiction_profile_versions" ADD COLUMN IF NOT EXISTS "verification_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'curriculum_jurisdiction_approvals'::regclass AND conname IN ('curriculum_jurisdiction_approvals_course_template_version_id_fkey','curriculum_jurisdiction_approvals_course_template_version_id_course_template_versions_id_fk')) THEN
  ALTER TABLE "curriculum_jurisdiction_approvals" ADD CONSTRAINT "curriculum_jurisdiction_approvals_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'curriculum_jurisdiction_approvals'::regclass AND conname IN ('curriculum_jurisdiction_approvals_jurisdiction_id_fkey','curriculum_jurisdiction_approvals_jurisdiction_id_jurisdictions_id_fk')) THEN
  ALTER TABLE "curriculum_jurisdiction_approvals" ADD CONSTRAINT "curriculum_jurisdiction_approvals_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'curriculum_jurisdiction_approvals'::regclass AND conname IN ('curriculum_jurisdiction_approvals_authority_organization_id_fkey','curriculum_jurisdiction_approvals_authority_organization_id_organizations_id_fk')) THEN
  ALTER TABLE "curriculum_jurisdiction_approvals" ADD CONSTRAINT "curriculum_jurisdiction_approvals_authority_organization_id_organizations_id_fk" FOREIGN KEY ("authority_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'jurisdiction_profile_versions'::regclass AND conname IN ('jurisdiction_profile_versions_jurisdiction_id_fkey','jurisdiction_profile_versions_jurisdiction_id_jurisdictions_id_fk')) THEN
  ALTER TABLE "jurisdiction_profile_versions" ADD CONSTRAINT "jurisdiction_profile_versions_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'jurisdiction_profile_versions'::regclass AND conname IN ('jurisdiction_profile_versions_last_edited_by_person_id_fkey','jurisdiction_profile_versions_last_edited_by_person_id_people_id_fk')) THEN
  ALTER TABLE "jurisdiction_profile_versions" ADD CONSTRAINT "jurisdiction_profile_versions_last_edited_by_person_id_people_id_fk" FOREIGN KEY ("last_edited_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'jurisdiction_profile_versions'::regclass AND conname IN ('jurisdiction_profile_versions_verified_by_person_id_fkey','jurisdiction_profile_versions_verified_by_person_id_people_id_fk')) THEN
  ALTER TABLE "jurisdiction_profile_versions" ADD CONSTRAINT "jurisdiction_profile_versions_verified_by_person_id_people_id_fk" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;
 END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "curriculum_jurisdiction_approval_scope_uq" ON "curriculum_jurisdiction_approvals" USING btree ("course_template_version_id","jurisdiction_id","academic_purpose");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "curriculum_jurisdiction_approval_jurisdiction_idx" ON "curriculum_jurisdiction_approvals" USING btree ("jurisdiction_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "jurisdiction_profile_revision_uq" ON "jurisdiction_profile_versions" USING btree ("jurisdiction_id","revision");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "jurisdiction_profile_status_idx" ON "jurisdiction_profile_versions" USING btree ("jurisdiction_id","status");
