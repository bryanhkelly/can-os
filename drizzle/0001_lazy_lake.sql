CREATE TABLE "calendar_event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_event_id" uuid NOT NULL,
	"participant_type" text NOT NULL,
	"participant_id" uuid NOT NULL,
	"role" text,
	"response_status" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"consent_type" text NOT NULL,
	"signer_person_id" uuid NOT NULL,
	"document_id" uuid,
	"version" text NOT NULL,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"signature_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_obligations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"status" text DEFAULT 'due' NOT NULL,
	"due_at" timestamp with time zone,
	"satisfied_at" timestamp with time zone,
	"external_payment_reference" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_access_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"grantee_person_id" uuid NOT NULL,
	"site_id" uuid,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"purpose" text NOT NULL,
	"classification" text NOT NULL,
	"allowed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_through" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"granted_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_amendments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"amended_by_person_id" uuid NOT NULL,
	"field" text NOT NULL,
	"prior_value" jsonb,
	"new_value" jsonb,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"document_id" uuid,
	"type" text NOT NULL,
	"description" text,
	"added_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"recipient_person_id" uuid,
	"recipient_type" text NOT NULL,
	"recipient_label" text,
	"channel" text NOT NULL,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp with time zone,
	"acknowledged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"reviewer_person_id" uuid NOT NULL,
	"level" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision" text,
	"notes" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_number" text NOT NULL,
	"type" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'filed' NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reporter_person_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid NOT NULL,
	"program_id" uuid,
	"location_text" text,
	"summary" text NOT NULL,
	"immediate_actions" text,
	"classification" text DEFAULT 'safety_restricted' NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_person_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_compliance_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'missing' NOT NULL,
	"due_on" date,
	"expires_on" date,
	"document_id" uuid,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_office_visits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"checked_in_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_out_at" timestamp with time zone,
	"reason" text NOT NULL,
	"disposition" text,
	"sent_home" boolean DEFAULT false NOT NULL,
	"handled_by_person_id" uuid NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"emergency_summary" text,
	"allergy_summary" text,
	"accommodation_summary" text,
	"classification" text DEFAULT 'medical' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_administrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"authorization_id" uuid NOT NULL,
	"site_id" uuid NOT NULL,
	"administered_by_person_id" uuid NOT NULL,
	"administered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dose" text,
	"result" text DEFAULT 'administered' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medication_authorizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"medication_name" text NOT NULL,
	"instructions" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"starts_on" date NOT NULL,
	"expires_on" date,
	"authorization_document_id" uuid,
	"guardian_consent_document_id" uuid,
	"emergency_only" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "return_to_school_clearances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"health_office_visit_id" uuid,
	"status" text DEFAULT 'required' NOT NULL,
	"document_id" uuid,
	"cleared_by_person_id" uuid,
	"cleared_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trip_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_trip_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"status" text NOT NULL,
	"checkpoint" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_person_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trip_chaperones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_trip_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text DEFAULT 'chaperone' NOT NULL,
	"access_grant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trip_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_trip_id" uuid NOT NULL,
	"incident_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trip_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"field_trip_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"consent_record_id" uuid,
	"financial_obligation_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"program_id" uuid,
	"calendar_event_id" uuid,
	"title" text NOT NULL,
	"destination" text NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"proposed_by_person_id" uuid NOT NULL,
	"approved_by_person_id" uuid,
	"approved_at" timestamp with time zone,
	"departs_at" timestamp with time zone NOT NULL,
	"returns_at" timestamp with time zone NOT NULL,
	"permission_due_at" timestamp with time zone,
	"fee_amount_cents" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"program_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"advisor_person_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_season_id" uuid NOT NULL,
	"calendar_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_eligibility_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_registration_id" uuid NOT NULL,
	"status" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checked_by_person_id" uuid,
	"rule_version" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"valid_through" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_season_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"consent_record_id" uuid,
	"physical_document_id" uuid,
	"physical_expires_on" date,
	"financial_obligation_id" uuid,
	"eligibility_status" text DEFAULT 'pending' NOT NULL,
	"roster_status" text DEFAULT 'not_rostered' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_seasons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"name" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"registration_opens_at" timestamp with time zone,
	"registration_closes_at" timestamp with time zone,
	"fee_amount_cents" integer,
	"status" text DEFAULT 'registration' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_booking_id" uuid NOT NULL,
	"action_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_slot_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"guardian_person_id" uuid NOT NULL,
	"status" text DEFAULT 'booked' NOT NULL,
	"communication_thread_id" uuid,
	"booked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_booking_id" uuid NOT NULL,
	"author_person_id" uuid NOT NULL,
	"visibility" text DEFAULT 'staff_private' NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_series" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"section_id" uuid,
	"teacher_person_id" uuid NOT NULL,
	"title" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"slot_minutes" integer DEFAULT 20 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conference_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conference_series_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'available' NOT NULL,
	"calendar_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "academic_calendar_year_version_uq";--> statement-breakpoint
DROP INDEX "school_year_scope_key_uq";--> statement-breakpoint
ALTER TABLE "academic_calendars" ADD COLUMN "site_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD COLUMN "site_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "school_years" ADD COLUMN "site_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "retention_policy" text;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "verified_by_person_id" uuid;--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ADD CONSTRAINT "calendar_event_participants_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_signer_person_id_people_id_fk" FOREIGN KEY ("signer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_obligations" ADD CONSTRAINT "financial_obligations_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_grants" ADD CONSTRAINT "sensitive_access_grants_grantee_person_id_people_id_fk" FOREIGN KEY ("grantee_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_grants" ADD CONSTRAINT "sensitive_access_grants_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_access_grants" ADD CONSTRAINT "sensitive_access_grants_granted_by_person_id_people_id_fk" FOREIGN KEY ("granted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_actions" ADD CONSTRAINT "incident_actions_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_amendments" ADD CONSTRAINT "incident_amendments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_amendments" ADD CONSTRAINT "incident_amendments_amended_by_person_id_people_id_fk" FOREIGN KEY ("amended_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_evidence" ADD CONSTRAINT "incident_evidence_added_by_person_id_people_id_fk" FOREIGN KEY ("added_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_people" ADD CONSTRAINT "incident_people_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_people" ADD CONSTRAINT "incident_people_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reviews" ADD CONSTRAINT "incident_reviews_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_reviews" ADD CONSTRAINT "incident_reviews_reviewer_person_id_people_id_fk" FOREIGN KEY ("reviewer_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reporter_person_id_people_id_fk" FOREIGN KEY ("reporter_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closed_by_person_id_people_id_fk" FOREIGN KEY ("closed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_compliance_items" ADD CONSTRAINT "health_compliance_items_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_compliance_items" ADD CONSTRAINT "health_compliance_items_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_compliance_items" ADD CONSTRAINT "health_compliance_items_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_office_visits" ADD CONSTRAINT "health_office_visits_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_office_visits" ADD CONSTRAINT "health_office_visits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_office_visits" ADD CONSTRAINT "health_office_visits_handled_by_person_id_people_id_fk" FOREIGN KEY ("handled_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_profiles" ADD CONSTRAINT "health_profiles_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_authorization_id_medication_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."medication_authorizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_administrations" ADD CONSTRAINT "medication_administrations_administered_by_person_id_people_id_fk" FOREIGN KEY ("administered_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_authorizations" ADD CONSTRAINT "medication_authorizations_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_authorizations" ADD CONSTRAINT "medication_authorizations_authorization_document_id_documents_id_fk" FOREIGN KEY ("authorization_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medication_authorizations" ADD CONSTRAINT "medication_authorizations_guardian_consent_document_id_documents_id_fk" FOREIGN KEY ("guardian_consent_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ADD CONSTRAINT "return_to_school_clearances_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ADD CONSTRAINT "return_to_school_clearances_health_office_visit_id_health_office_visits_id_fk" FOREIGN KEY ("health_office_visit_id") REFERENCES "public"."health_office_visits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ADD CONSTRAINT "return_to_school_clearances_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ADD CONSTRAINT "return_to_school_clearances_cleared_by_person_id_people_id_fk" FOREIGN KEY ("cleared_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_attendance" ADD CONSTRAINT "field_trip_attendance_field_trip_id_field_trips_id_fk" FOREIGN KEY ("field_trip_id") REFERENCES "public"."field_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_attendance" ADD CONSTRAINT "field_trip_attendance_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_attendance" ADD CONSTRAINT "field_trip_attendance_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_chaperones" ADD CONSTRAINT "field_trip_chaperones_field_trip_id_field_trips_id_fk" FOREIGN KEY ("field_trip_id") REFERENCES "public"."field_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_chaperones" ADD CONSTRAINT "field_trip_chaperones_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_chaperones" ADD CONSTRAINT "field_trip_chaperones_access_grant_id_sensitive_access_grants_id_fk" FOREIGN KEY ("access_grant_id") REFERENCES "public"."sensitive_access_grants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_incidents" ADD CONSTRAINT "field_trip_incidents_field_trip_id_field_trips_id_fk" FOREIGN KEY ("field_trip_id") REFERENCES "public"."field_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_incidents" ADD CONSTRAINT "field_trip_incidents_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_participants" ADD CONSTRAINT "field_trip_participants_field_trip_id_field_trips_id_fk" FOREIGN KEY ("field_trip_id") REFERENCES "public"."field_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_participants" ADD CONSTRAINT "field_trip_participants_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_participants" ADD CONSTRAINT "field_trip_participants_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trip_participants" ADD CONSTRAINT "field_trip_participants_financial_obligation_id_financial_obligations_id_fk" FOREIGN KEY ("financial_obligation_id") REFERENCES "public"."financial_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trips" ADD CONSTRAINT "field_trips_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trips" ADD CONSTRAINT "field_trips_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trips" ADD CONSTRAINT "field_trips_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trips" ADD CONSTRAINT "field_trips_proposed_by_person_id_people_id_fk" FOREIGN KEY ("proposed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_trips" ADD CONSTRAINT "field_trips_approved_by_person_id_people_id_fk" FOREIGN KEY ("approved_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_advisor_person_id_people_id_fk" FOREIGN KEY ("advisor_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_calendar_events" ADD CONSTRAINT "activity_calendar_events_activity_season_id_activity_seasons_id_fk" FOREIGN KEY ("activity_season_id") REFERENCES "public"."activity_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_calendar_events" ADD CONSTRAINT "activity_calendar_events_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_eligibility_checks" ADD CONSTRAINT "activity_eligibility_checks_activity_registration_id_activity_registrations_id_fk" FOREIGN KEY ("activity_registration_id") REFERENCES "public"."activity_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_eligibility_checks" ADD CONSTRAINT "activity_eligibility_checks_checked_by_person_id_people_id_fk" FOREIGN KEY ("checked_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_activity_season_id_activity_seasons_id_fk" FOREIGN KEY ("activity_season_id") REFERENCES "public"."activity_seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_consent_record_id_consent_records_id_fk" FOREIGN KEY ("consent_record_id") REFERENCES "public"."consent_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_physical_document_id_documents_id_fk" FOREIGN KEY ("physical_document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_financial_obligation_id_financial_obligations_id_fk" FOREIGN KEY ("financial_obligation_id") REFERENCES "public"."financial_obligations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_seasons" ADD CONSTRAINT "activity_seasons_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_actions" ADD CONSTRAINT "conference_actions_conference_booking_id_conference_bookings_id_fk" FOREIGN KEY ("conference_booking_id") REFERENCES "public"."conference_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_actions" ADD CONSTRAINT "conference_actions_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_conference_slot_id_conference_slots_id_fk" FOREIGN KEY ("conference_slot_id") REFERENCES "public"."conference_slots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_communication_thread_id_communication_threads_id_fk" FOREIGN KEY ("communication_thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_notes" ADD CONSTRAINT "conference_notes_conference_booking_id_conference_bookings_id_fk" FOREIGN KEY ("conference_booking_id") REFERENCES "public"."conference_bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_notes" ADD CONSTRAINT "conference_notes_author_person_id_people_id_fk" FOREIGN KEY ("author_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_series" ADD CONSTRAINT "conference_series_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_series" ADD CONSTRAINT "conference_series_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_series" ADD CONSTRAINT "conference_series_teacher_person_id_people_id_fk" FOREIGN KEY ("teacher_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_slots" ADD CONSTRAINT "conference_slots_conference_series_id_conference_series_id_fk" FOREIGN KEY ("conference_series_id") REFERENCES "public"."conference_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conference_slots" ADD CONSTRAINT "conference_slots_calendar_event_id_calendar_events_id_fk" FOREIGN KEY ("calendar_event_id") REFERENCES "public"."calendar_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_participant_event_idx" ON "calendar_event_participants" USING btree ("calendar_event_id");--> statement-breakpoint
CREATE INDEX "calendar_participant_subject_idx" ON "calendar_event_participants" USING btree ("participant_type","participant_id");--> statement-breakpoint
CREATE INDEX "consent_subject_idx" ON "consent_records" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "consent_household_idx" ON "consent_records" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "consent_signer_idx" ON "consent_records" USING btree ("signer_person_id");--> statement-breakpoint
CREATE INDEX "financial_obligation_household_status_idx" ON "financial_obligations" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "financial_obligation_subject_idx" ON "financial_obligations" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "sensitive_access_grantee_idx" ON "sensitive_access_grants" USING btree ("grantee_person_id","valid_through");--> statement-breakpoint
CREATE INDEX "sensitive_access_resource_idx" ON "sensitive_access_grants" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "sensitive_access_site_idx" ON "sensitive_access_grants" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_action_uq" ON "incident_actions" USING btree ("incident_id","action_id");--> statement-breakpoint
CREATE INDEX "incident_amendment_incident_idx" ON "incident_amendments" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_evidence_incident_idx" ON "incident_evidence" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_notification_incident_idx" ON "incident_notifications" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_notification_recipient_idx" ON "incident_notifications" USING btree ("recipient_person_id");--> statement-breakpoint
CREATE INDEX "incident_people_incident_idx" ON "incident_people" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_people_person_idx" ON "incident_people" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "incident_review_incident_idx" ON "incident_reviews" USING btree ("incident_id");--> statement-breakpoint
CREATE INDEX "incident_review_reviewer_status_idx" ON "incident_reviews" USING btree ("reviewer_person_id","status");--> statement-breakpoint
CREATE INDEX "incident_site_status_idx" ON "incidents" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "incident_severity_idx" ON "incidents" USING btree ("severity","status");--> statement-breakpoint
CREATE INDEX "incident_occurred_idx" ON "incidents" USING btree ("occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "incident_number_uq" ON "incidents" USING btree ("incident_number");--> statement-breakpoint
CREATE INDEX "health_compliance_student_status_idx" ON "health_compliance_items" USING btree ("student_profile_id","status");--> statement-breakpoint
CREATE INDEX "health_compliance_expiry_idx" ON "health_compliance_items" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "health_visit_student_time_idx" ON "health_office_visits" USING btree ("student_profile_id","checked_in_at");--> statement-breakpoint
CREATE INDEX "health_visit_site_time_idx" ON "health_office_visits" USING btree ("site_id","checked_in_at");--> statement-breakpoint
CREATE UNIQUE INDEX "health_profile_student_uq" ON "health_profiles" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "medication_admin_authorization_idx" ON "medication_administrations" USING btree ("authorization_id");--> statement-breakpoint
CREATE INDEX "medication_admin_site_time_idx" ON "medication_administrations" USING btree ("site_id","administered_at");--> statement-breakpoint
CREATE INDEX "medication_auth_student_status_idx" ON "medication_authorizations" USING btree ("student_profile_id","status");--> statement-breakpoint
CREATE INDEX "medication_auth_expiry_idx" ON "medication_authorizations" USING btree ("expires_on");--> statement-breakpoint
CREATE INDEX "return_clearance_student_status_idx" ON "return_to_school_clearances" USING btree ("student_profile_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "field_trip_attendance_source_uq" ON "field_trip_attendance" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "field_trip_attendance_trip_idx" ON "field_trip_attendance" USING btree ("field_trip_id","checkpoint");--> statement-breakpoint
CREATE UNIQUE INDEX "field_trip_chaperone_uq" ON "field_trip_chaperones" USING btree ("field_trip_id","person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_trip_incident_uq" ON "field_trip_incidents" USING btree ("field_trip_id","incident_id");--> statement-breakpoint
CREATE UNIQUE INDEX "field_trip_student_uq" ON "field_trip_participants" USING btree ("field_trip_id","student_profile_id");--> statement-breakpoint
CREATE INDEX "field_trip_participant_status_idx" ON "field_trip_participants" USING btree ("field_trip_id","status");--> statement-breakpoint
CREATE INDEX "field_trip_site_status_idx" ON "field_trips" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "field_trip_departure_idx" ON "field_trips" USING btree ("departs_at");--> statement-breakpoint
CREATE INDEX "activity_site_type_idx" ON "activities" USING btree ("site_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_calendar_event_uq" ON "activity_calendar_events" USING btree ("activity_season_id","calendar_event_id");--> statement-breakpoint
CREATE INDEX "activity_eligibility_registration_idx" ON "activity_eligibility_checks" USING btree ("activity_registration_id","checked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_registration_student_uq" ON "activity_registrations" USING btree ("activity_season_id","student_profile_id");--> statement-breakpoint
CREATE INDEX "activity_registration_status_idx" ON "activity_registrations" USING btree ("activity_season_id","status");--> statement-breakpoint
CREATE INDEX "activity_physical_expiry_idx" ON "activity_registrations" USING btree ("physical_expires_on");--> statement-breakpoint
CREATE INDEX "activity_season_activity_idx" ON "activity_seasons" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conference_action_uq" ON "conference_actions" USING btree ("conference_booking_id","action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conference_slot_booking_uq" ON "conference_bookings" USING btree ("conference_slot_id");--> statement-breakpoint
CREATE INDEX "conference_booking_student_idx" ON "conference_bookings" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "conference_booking_guardian_idx" ON "conference_bookings" USING btree ("guardian_person_id");--> statement-breakpoint
CREATE INDEX "conference_note_booking_idx" ON "conference_notes" USING btree ("conference_booking_id");--> statement-breakpoint
CREATE INDEX "conference_series_teacher_time_idx" ON "conference_series" USING btree ("teacher_person_id","starts_at");--> statement-breakpoint
CREATE INDEX "conference_series_site_time_idx" ON "conference_series" USING btree ("site_id","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conference_slot_series_time_uq" ON "conference_slots" USING btree ("conference_series_id","starts_at");--> statement-breakpoint
CREATE INDEX "conference_slot_status_idx" ON "conference_slots" USING btree ("conference_series_id","status");--> statement-breakpoint
ALTER TABLE "academic_calendars" ADD CONSTRAINT "academic_calendars_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_verified_by_person_id_people_id_fk" FOREIGN KEY ("verified_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "academic_calendar_year_site_version_uq" ON "academic_calendars" USING btree ("school_year_id","site_id","version");--> statement-breakpoint
CREATE INDEX "academic_calendar_site_active_idx" ON "academic_calendars" USING btree ("site_id","active");--> statement-breakpoint
CREATE INDEX "schedule_template_site_active_idx" ON "schedule_templates" USING btree ("site_id","active");--> statement-breakpoint
CREATE INDEX "school_year_site_status_idx" ON "school_years" USING btree ("site_id","status");--> statement-breakpoint
CREATE INDEX "document_sensitivity_idx" ON "documents" USING btree ("sensitivity_tier");--> statement-breakpoint
CREATE INDEX "document_expiry_idx" ON "documents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "school_year_scope_key_uq" ON "school_years" USING btree ("organization_id","program_id","site_id","key");