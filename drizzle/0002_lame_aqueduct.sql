CREATE TABLE "compliance_framework_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_id" uuid NOT NULL,
	"version" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone,
	"effective_through" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"authority" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_policy_applicability" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_version_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"jurisdiction_id" uuid,
	"role_key" text,
	"effective_from" timestamp with time zone,
	"effective_through" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_policy_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"approved_by_person_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"evidence_document_id" uuid,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_through" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_policy_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"framework_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text NOT NULL,
	"expression" jsonb NOT NULL,
	"evidence_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_profile_details" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"headline" text,
	"biography" text,
	"preferred_contact_method" text,
	"visibility" text DEFAULT 'internal' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "program_responsibility_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"configuration_version_id" uuid NOT NULL,
	"responsibility_key" text NOT NULL,
	"accountable_organization_id" uuid NOT NULL,
	"responsible_role_assignment_id" uuid,
	"effective_from" timestamp with time zone,
	"effective_through" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"definition_id" uuid NOT NULL,
	"issuer_name" text,
	"jurisdiction_id" uuid,
	"issued_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"attributes_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qualification_verification_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"claim_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"decision" text NOT NULL,
	"actor_person_id" uuid NOT NULL,
	"evidence_document_id" uuid,
	"source_provider" text,
	"source_reference" text,
	"reason" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_configuration_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"deployment_model" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"config" jsonb NOT NULL,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staffing_eligibility_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role_assignment_id" uuid NOT NULL,
	"policy_rule_id" uuid NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"result" text NOT NULL,
	"explanation" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "compliance_framework_versions" ADD CONSTRAINT "compliance_framework_versions_framework_id_compliance_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."compliance_frameworks"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_applicability" ADD CONSTRAINT "compliance_policy_applicability_framework_version_id_compliance_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."compliance_framework_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_applicability" ADD CONSTRAINT "compliance_policy_applicability_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_applicability" ADD CONSTRAINT "compliance_policy_applicability_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_applicability" ADD CONSTRAINT "compliance_policy_applicability_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_applicability" ADD CONSTRAINT "compliance_policy_applicability_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_exceptions" ADD CONSTRAINT "compliance_policy_exceptions_rule_id_compliance_policy_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."compliance_policy_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_exceptions" ADD CONSTRAINT "compliance_policy_exceptions_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_exceptions" ADD CONSTRAINT "compliance_policy_exceptions_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_policy_rules" ADD CONSTRAINT "compliance_policy_rules_framework_version_id_compliance_framework_versions_id_fk" FOREIGN KEY ("framework_version_id") REFERENCES "public"."compliance_framework_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_profile_details" ADD CONSTRAINT "person_profile_details_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_responsibility_assignments" ADD CONSTRAINT "program_responsibility_assignments_configuration_version_id_school_configuration_versions_id_fk" FOREIGN KEY ("configuration_version_id") REFERENCES "public"."school_configuration_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_responsibility_assignments" ADD CONSTRAINT "program_responsibility_assignments_accountable_organization_id_organizations_id_fk" FOREIGN KEY ("accountable_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_responsibility_assignments" ADD CONSTRAINT "program_responsibility_assignments_responsible_role_assignment_id_role_assignments_id_fk" FOREIGN KEY ("responsible_role_assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_claims" ADD CONSTRAINT "qualification_claims_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_claims" ADD CONSTRAINT "qualification_claims_definition_id_qualification_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."qualification_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_claims" ADD CONSTRAINT "qualification_claims_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_verification_events" ADD CONSTRAINT "qualification_verification_events_claim_id_qualification_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."qualification_claims"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_verification_events" ADD CONSTRAINT "qualification_verification_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qualification_verification_events" ADD CONSTRAINT "qualification_verification_events_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_configuration_versions" ADD CONSTRAINT "school_configuration_versions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_configuration_versions" ADD CONSTRAINT "school_configuration_versions_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_eligibility_evaluations" ADD CONSTRAINT "staffing_eligibility_evaluations_role_assignment_id_role_assignments_id_fk" FOREIGN KEY ("role_assignment_id") REFERENCES "public"."role_assignments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staffing_eligibility_evaluations" ADD CONSTRAINT "staffing_eligibility_evaluations_policy_rule_id_compliance_policy_rules_id_fk" FOREIGN KEY ("policy_rule_id") REFERENCES "public"."compliance_policy_rules"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_framework_version_uq" ON "compliance_framework_versions" USING btree ("framework_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_framework_key_uq" ON "compliance_frameworks" USING btree ("key");--> statement-breakpoint
CREATE INDEX "policy_applicability_program_idx" ON "compliance_policy_applicability" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "policy_applicability_org_idx" ON "compliance_policy_applicability" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "policy_exception_subject_idx" ON "compliance_policy_exceptions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "compliance_policy_rule_code_uq" ON "compliance_policy_rules" USING btree ("framework_version_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "person_profile_details_person_uq" ON "person_profile_details" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "program_responsibility_version_key_uq" ON "program_responsibility_assignments" USING btree ("configuration_version_id","responsibility_key");--> statement-breakpoint
CREATE INDEX "qualification_claim_person_idx" ON "qualification_claims" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "qualification_claim_definition_idx" ON "qualification_claims" USING btree ("definition_id");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_definition_key_uq" ON "qualification_definitions" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "qualification_verification_claim_sequence_uq" ON "qualification_verification_events" USING btree ("claim_id","sequence");--> statement-breakpoint
CREATE INDEX "qualification_verification_claim_time_idx" ON "qualification_verification_events" USING btree ("claim_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "school_configuration_program_version_uq" ON "school_configuration_versions" USING btree ("program_id","version");--> statement-breakpoint
CREATE INDEX "school_configuration_status_idx" ON "school_configuration_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "staffing_eligibility_assignment_idx" ON "staffing_eligibility_evaluations" USING btree ("role_assignment_id","evaluated_at");