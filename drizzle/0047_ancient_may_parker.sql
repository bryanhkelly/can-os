CREATE TABLE "pickup_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"pickup_person_id" uuid NOT NULL,
	"authorized_by_person_id" uuid NOT NULL,
	"relationship_label" text NOT NULL,
	"identity_verification_method" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_on" date NOT NULL,
	"expires_on" date,
	"source_key" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by_person_id" uuid,
	"revocation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_custody_holds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_person_id" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_release_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"attendance_event_id" uuid NOT NULL,
	"pickup_authorization_id" uuid,
	"pickup_person_id" uuid,
	"presented_name" text NOT NULL,
	"release_date" date NOT NULL,
	"status" text NOT NULL,
	"denial_reason" text,
	"identity_verified" boolean DEFAULT false NOT NULL,
	"identity_verification_method" text,
	"staff_witness_person_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"handoff_evidence" text,
	"detail" text,
	"source_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_case_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"responsibility" text NOT NULL,
	"assigned_by_person_id" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "safeguarding_concerns" (
	"incident_id" uuid PRIMARY KEY NOT NULL,
	"reporter_person_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"student_profile_id" uuid,
	"concern_kinds" jsonb NOT NULL,
	"source" text NOT NULL,
	"immediate_danger" text NOT NULL,
	"urgent" boolean NOT NULL,
	"policy_version" text NOT NULL,
	"acknowledgment_due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_external_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"reporter_person_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"status" text NOT NULL,
	"agency_type" text NOT NULL,
	"agency_label" text NOT NULL,
	"channel" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reference" text,
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_site_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"jurisdiction_id" uuid NOT NULL,
	"procedure_version" text NOT NULL,
	"emergency_instructions" text NOT NULL,
	"external_reporting_instructions" text NOT NULL,
	"offline_instructions" text NOT NULL,
	"acknowledgment_due_minutes" integer NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "safeguarding_site_responders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"responsibility" text NOT NULL,
	"appointed_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_relationships" ADD COLUMN "can_manage_pickup" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "incident_evidence" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_pickup_person_id_people_id_fk" FOREIGN KEY ("pickup_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_authorized_by_person_id_people_id_fk" FOREIGN KEY ("authorized_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_authorizations" ADD CONSTRAINT "pickup_authorizations_revoked_by_person_id_people_id_fk" FOREIGN KEY ("revoked_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_custody_holds" ADD CONSTRAINT "pickup_custody_holds_resolved_by_person_id_people_id_fk" FOREIGN KEY ("resolved_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_attendance_event_id_attendance_events_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_pickup_authorization_id_pickup_authorizations_id_fk" FOREIGN KEY ("pickup_authorization_id") REFERENCES "public"."pickup_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_pickup_person_id_people_id_fk" FOREIGN KEY ("pickup_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_release_events" ADD CONSTRAINT "pickup_release_events_staff_witness_person_id_people_id_fk" FOREIGN KEY ("staff_witness_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_case_assignments" ADD CONSTRAINT "safeguarding_case_assignments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_case_assignments" ADD CONSTRAINT "safeguarding_case_assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_case_assignments" ADD CONSTRAINT "safeguarding_case_assignments_assigned_by_person_id_people_id_fk" FOREIGN KEY ("assigned_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_external_reports" ADD CONSTRAINT "safeguarding_external_reports_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_external_reports" ADD CONSTRAINT "safeguarding_external_reports_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_policies" ADD CONSTRAINT "safeguarding_site_policies_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_policies" ADD CONSTRAINT "safeguarding_site_policies_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_policies" ADD CONSTRAINT "safeguarding_site_policies_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_responders" ADD CONSTRAINT "safeguarding_site_responders_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_responders" ADD CONSTRAINT "safeguarding_site_responders_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "safeguarding_site_responders" ADD CONSTRAINT "safeguarding_site_responders_appointed_by_person_id_people_id_fk" FOREIGN KEY ("appointed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_authorization_source_key_uq" ON "pickup_authorizations" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "pickup_authorization_roster_idx" ON "pickup_authorizations" USING btree ("program_id","student_profile_id","status");--> statement-breakpoint
CREATE INDEX "pickup_authorization_person_idx" ON "pickup_authorizations" USING btree ("pickup_person_id");--> statement-breakpoint
CREATE INDEX "pickup_authorization_household_idx" ON "pickup_authorizations" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_custody_hold_source_key_uq" ON "pickup_custody_holds" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "pickup_custody_hold_roster_idx" ON "pickup_custody_holds" USING btree ("program_id","student_profile_id","status");--> statement-breakpoint
CREATE INDEX "pickup_custody_hold_household_idx" ON "pickup_custody_holds" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pickup_release_event_source_key_uq" ON "pickup_release_events" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "pickup_release_event_roster_idx" ON "pickup_release_events" USING btree ("program_id","student_profile_id","release_date");--> statement-breakpoint
CREATE INDEX "pickup_release_event_attendance_idx" ON "pickup_release_events" USING btree ("attendance_event_id");--> statement-breakpoint
CREATE INDEX "pickup_release_event_site_time_idx" ON "pickup_release_events" USING btree ("site_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_case_assignment_uq" ON "safeguarding_case_assignments" USING btree ("incident_id","person_id","responsibility");--> statement-breakpoint
CREATE INDEX "safeguarding_case_assignment_person_idx" ON "safeguarding_case_assignments" USING btree ("person_id","revoked_at");--> statement-breakpoint
CREATE INDEX "safeguarding_case_assignment_incident_idx" ON "safeguarding_case_assignments" USING btree ("incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_concern_reporter_idempotency_uq" ON "safeguarding_concerns" USING btree ("reporter_person_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "safeguarding_concern_student_idx" ON "safeguarding_concerns" USING btree ("student_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_external_report_idempotency_uq" ON "safeguarding_external_reports" USING btree ("incident_id","reporter_person_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "safeguarding_external_report_incident_idx" ON "safeguarding_external_reports" USING btree ("incident_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_site_policy_site_uq" ON "safeguarding_site_policies" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "safeguarding_site_responder_role_uq" ON "safeguarding_site_responders" USING btree ("site_id","responsibility");--> statement-breakpoint
CREATE INDEX "safeguarding_site_responder_person_idx" ON "safeguarding_site_responders" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_evidence_actor_idempotency_uq" ON "incident_evidence" USING btree ("incident_id","added_by_person_id","idempotency_key");
