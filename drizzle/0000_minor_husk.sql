CREATE TYPE "public"."action_priority" AS ENUM('low', 'normal', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."action_status" AS ENUM('open', 'in_progress', 'waiting', 'resolved', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."application_stage" AS ENUM('lead', 'inquiry', 'application', 'eligibility', 'accepted', 'declined', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."assessment_status" AS ENUM('draft', 'published', 'closed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('expected', 'present', 'absent', 'tardy', 'excused');--> statement-breakpoint
CREATE TYPE "public"."communication_participant_type" AS ENUM('person', 'household', 'organization', 'site', 'program', 'section');--> statement-breakpoint
CREATE TYPE "public"."domain_event_status" AS ENUM('pending', 'processing', 'processed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."enrollment_kind" AS ENUM('program', 'school_year', 'section');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('applicant', 'accepted', 'active', 'transferred', 'withdrawn', 'graduated', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."attendance_excuse_status" AS ENUM('submitted', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."instructional_day_type" AS ENUM('instructional', 'holiday', 'closure', 'special', 'makeup');--> statement-breakpoint
CREATE TYPE "public"."journey_requirement_status" AS ENUM('needs_you', 'needs_can', 'waiting_third_party', 'blocked', 'complete');--> statement-breakpoint
CREATE TYPE "public"."journey_status" AS ENUM('not_started', 'in_progress', 'blocked', 'ready', 'active', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."notification_status" AS ENUM('unread', 'read', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."organization_type" AS ENUM('can_network', 'denomination', 'church', 'christian_school', 'microschool_operator', 'consortium', 'other_partner');--> statement-breakpoint
CREATE TYPE "public"."program_status" AS ENUM('draft', 'launching', 'ready', 'active', 'paused', 'closed');--> statement-breakpoint
CREATE TYPE "public"."program_type" AS ENUM('church_hosted_academy', 'high_school_extension', 'full_school', 'microschool', 'hybrid_program', 'homeschool_cohort', 'summer_enrichment');--> statement-breakpoint
CREATE TYPE "public"."school_year_status" AS ENUM('draft', 'ready', 'active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('assigned', 'submitted', 'graded', 'returned');--> statement-breakpoint
CREATE TYPE "public"."submission_timeliness" AS ENUM('on_time', 'late', 'missing', 'excused');--> statement-breakpoint
CREATE TABLE "auth_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "guardian_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"guardian_person_id" uuid NOT NULL,
	"student_person_id" uuid NOT NULL,
	"relationship_label" text NOT NULL,
	"can_view_academics" boolean DEFAULT true NOT NULL,
	"can_manage_enrollment" boolean DEFAULT true NOT NULL,
	"can_submit_attendance_excuse" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"relationship_label" text NOT NULL,
	"is_primary_contact" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"primary_email" text,
	"primary_phone" text,
	"address" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_first_name" text NOT NULL,
	"legal_last_name" text NOT NULL,
	"preferred_name" text,
	"email" text,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"student_number" text,
	"grade_level" text,
	"preferred_pronouns" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"country_code" text DEFAULT 'US' NOT NULL,
	"region_code" text,
	"name" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_organization_id" uuid,
	"type" "organization_type" NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"slug" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"site_id" uuid,
	"jurisdiction_id" uuid NOT NULL,
	"type" "program_type" NOT NULL,
	"status" "program_status" DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"grade_range" jsonb NOT NULL,
	"delivery_model" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"host_organization_id" uuid,
	"academic_provider_organization_id" uuid NOT NULL,
	"credit_issuing_organization_id" uuid NOT NULL,
	"accreditation_authority_organization_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"person_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"role_key" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"address" jsonb,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_calendar_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"academic_calendar_id" uuid NOT NULL,
	"calendar_date" date NOT NULL,
	"type" "instructional_day_type" NOT NULL,
	"title" text,
	"instructional_minutes" integer,
	"notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "academic_calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grade_scales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owning_organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"version" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"configuration" jsonb NOT NULL,
	"effective_from" date,
	"effective_through" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"term_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"grade_posting_opens_at" timestamp with time zone,
	"grade_posting_closes_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_template_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"schedule_template_id" uuid NOT NULL,
	"day_of_week" integer NOT NULL,
	"sequence" integer NOT NULL,
	"label" text NOT NULL,
	"starts_at_local" time NOT NULL,
	"ends_at_local" time NOT NULL,
	"type" text DEFAULT 'instruction' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"program_id" uuid,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"effective_from" date NOT NULL,
	"effective_through" date,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "school_years" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" "school_year_status" DEFAULT 'draft' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"grade_scale_id" uuid NOT NULL,
	"timezone" text DEFAULT 'America/Los_Angeles' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_year_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"title" text NOT NULL,
	"instructions" text,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"points_possible" numeric(8, 2),
	"available_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_person_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_template_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"curriculum" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owning_organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"kind" "enrollment_kind" NOT NULL,
	"status" "enrollment_status" NOT NULL,
	"organization_id" uuid NOT NULL,
	"program_id" uuid,
	"section_id" uuid,
	"school_year_id" uuid,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "section_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"section_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"role" text DEFAULT 'teacher' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid,
	"course_template_version_id" uuid NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"term_id" uuid NOT NULL,
	"schedule_template_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assessment_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"status" "submission_status" DEFAULT 'assigned' NOT NULL,
	"timeliness" "submission_timeliness" DEFAULT 'on_time' NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"submitted_at" timestamp with time zone,
	"graded_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	"score" numeric(8, 2),
	"grader_person_id" uuid,
	"response" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"feedback" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "action_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_id" uuid NOT NULL,
	"blocked_by_action_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" "action_status" DEFAULT 'open' NOT NULL,
	"priority" "action_priority" DEFAULT 'normal' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"owner_person_id" uuid,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"due_at" timestamp with time zone,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"parent_action_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_person_id" uuid,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid NOT NULL,
	"scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domain_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"actor_person_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "domain_event_status" DEFAULT 'pending' NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"journey_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"status" "journey_requirement_status" DEFAULT 'needs_you' NOT NULL,
	"blocking" boolean DEFAULT false NOT NULL,
	"owner_person_id" uuid,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" "journey_status" DEFAULT 'not_started' NOT NULL,
	"participant_type" text NOT NULL,
	"participant_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"owner_person_id" uuid,
	"journey_definition_id" uuid NOT NULL,
	"definition_version" text NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_person_id" uuid NOT NULL,
	"type" text NOT NULL,
	"status" "notification_status" DEFAULT 'unread' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"resource_type" text,
	"resource_id" uuid,
	"event_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"uncertainty" text,
	"recommended_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"acknowledged_by_person_id" uuid,
	"acknowledged_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"sender_person_id" uuid NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"thread_id" uuid NOT NULL,
	"participant_type" "communication_participant_type" NOT NULL,
	"participant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communication_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject" text NOT NULL,
	"context_type" text,
	"context_id" uuid,
	"created_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"site_id" uuid,
	"section_id" uuid,
	"occurrence_key" text NOT NULL,
	"status" "attendance_status" NOT NULL,
	"expected_at" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by_person_id" uuid NOT NULL,
	"source_key" text,
	"supersedes_attendance_event_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_excuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attendance_event_id" uuid NOT NULL,
	"submitted_by_person_id" uuid NOT NULL,
	"status" "attendance_excuse_status" DEFAULT 'submitted' NOT NULL,
	"reason" text NOT NULL,
	"document_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by_person_id" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"student_profile_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"stage" "application_stage" DEFAULT 'application' NOT NULL,
	"idempotency_key" text NOT NULL,
	"submitted_by_person_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"category" text NOT NULL,
	"file_name" text NOT NULL,
	"storage_provider" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text,
	"sensitivity_tier" text DEFAULT 'standard' NOT NULL,
	"uploaded_by_person_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journey_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"version" text NOT NULL,
	"owning_organization_id" uuid,
	"audience" text NOT NULL,
	"title" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"organization_id" uuid,
	"site_id" uuid,
	"program_id" uuid,
	"section_id" uuid,
	"source_type" text,
	"source_id" uuid,
	"created_by_person_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_guardian_person_id_people_id_fk" FOREIGN KEY ("guardian_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_relationships" ADD CONSTRAINT "guardian_relationships_student_person_id_people_id_fk" FOREIGN KEY ("student_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_memberships" ADD CONSTRAINT "household_memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_profiles" ADD CONSTRAINT "student_profiles_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_jurisdiction_id_jurisdictions_id_fk" FOREIGN KEY ("jurisdiction_id") REFERENCES "public"."jurisdictions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_host_organization_id_organizations_id_fk" FOREIGN KEY ("host_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_academic_provider_organization_id_organizations_id_fk" FOREIGN KEY ("academic_provider_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_credit_issuing_organization_id_organizations_id_fk" FOREIGN KEY ("credit_issuing_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_accreditation_authority_organization_id_organizations_id_fk" FOREIGN KEY ("accreditation_authority_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_calendar_days" ADD CONSTRAINT "academic_calendar_days_academic_calendar_id_academic_calendars_id_fk" FOREIGN KEY ("academic_calendar_id") REFERENCES "public"."academic_calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "academic_calendars" ADD CONSTRAINT "academic_calendars_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_scales" ADD CONSTRAINT "grade_scales_owning_organization_id_organizations_id_fk" FOREIGN KEY ("owning_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grading_periods" ADD CONSTRAINT "grading_periods_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_template_periods" ADD CONSTRAINT "schedule_template_periods_schedule_template_id_schedule_templates_id_fk" FOREIGN KEY ("schedule_template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_years" ADD CONSTRAINT "school_years_grade_scale_id_grade_scales_id_fk" FOREIGN KEY ("grade_scale_id") REFERENCES "public"."grade_scales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_template_versions" ADD CONSTRAINT "course_template_versions_course_template_id_course_templates_id_fk" FOREIGN KEY ("course_template_id") REFERENCES "public"."course_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_templates" ADD CONSTRAINT "course_templates_owning_organization_id_organizations_id_fk" FOREIGN KEY ("owning_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_school_year_id_school_years_id_fk" FOREIGN KEY ("school_year_id") REFERENCES "public"."school_years"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_teachers" ADD CONSTRAINT "section_teachers_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "section_teachers" ADD CONSTRAINT "section_teachers_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_course_template_version_id_course_template_versions_id_fk" FOREIGN KEY ("course_template_version_id") REFERENCES "public"."course_template_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_schedule_template_id_schedule_templates_id_fk" FOREIGN KEY ("schedule_template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assessment_id_assessments_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_grader_person_id_people_id_fk" FOREIGN KEY ("grader_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_dependencies" ADD CONSTRAINT "action_dependencies_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_dependencies" ADD CONSTRAINT "action_dependencies_blocked_by_action_id_actions_id_fk" FOREIGN KEY ("blocked_by_action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domain_events" ADD CONSTRAINT "domain_events_actor_person_id_people_id_fk" FOREIGN KEY ("actor_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_requirements" ADD CONSTRAINT "journey_requirements_journey_id_journeys_id_fk" FOREIGN KEY ("journey_id") REFERENCES "public"."journeys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_requirements" ADD CONSTRAINT "journey_requirements_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_owner_person_id_people_id_fk" FOREIGN KEY ("owner_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journeys" ADD CONSTRAINT "journeys_journey_definition_id_journey_definitions_id_fk" FOREIGN KEY ("journey_definition_id") REFERENCES "public"."journey_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_person_id_people_id_fk" FOREIGN KEY ("recipient_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_domain_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."domain_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_acknowledged_by_person_id_people_id_fk" FOREIGN KEY ("acknowledged_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_messages" ADD CONSTRAINT "communication_messages_sender_person_id_people_id_fk" FOREIGN KEY ("sender_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_participants" ADD CONSTRAINT "communication_participants_thread_id_communication_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."communication_threads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_threads" ADD CONSTRAINT "communication_threads_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_recorded_by_person_id_people_id_fk" FOREIGN KEY ("recorded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_excuses" ADD CONSTRAINT "attendance_excuses_attendance_event_id_attendance_events_id_fk" FOREIGN KEY ("attendance_event_id") REFERENCES "public"."attendance_events"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_excuses" ADD CONSTRAINT "attendance_excuses_submitted_by_person_id_people_id_fk" FOREIGN KEY ("submitted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_excuses" ADD CONSTRAINT "attendance_excuses_reviewed_by_person_id_people_id_fk" FOREIGN KEY ("reviewed_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_student_profile_id_student_profiles_id_fk" FOREIGN KEY ("student_profile_id") REFERENCES "public"."student_profiles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_submitted_by_person_id_people_id_fk" FOREIGN KEY ("submitted_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_person_id_people_id_fk" FOREIGN KEY ("uploaded_by_person_id") REFERENCES "public"."people"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journey_definitions" ADD CONSTRAINT "journey_definitions_owning_organization_id_organizations_id_fk" FOREIGN KEY ("owning_organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_created_by_person_id_people_id_fk" FOREIGN KEY ("created_by_person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_identity_provider_subject_uq" ON "auth_identities" USING btree ("provider","provider_subject");--> statement-breakpoint
CREATE INDEX "auth_identity_person_idx" ON "auth_identities" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_student_uq" ON "guardian_relationships" USING btree ("guardian_person_id","student_person_id");--> statement-breakpoint
CREATE INDEX "guardian_student_student_idx" ON "guardian_relationships" USING btree ("student_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "household_person_uq" ON "household_memberships" USING btree ("household_id","person_id");--> statement-breakpoint
CREATE INDEX "household_membership_person_idx" ON "household_memberships" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "people_email_idx" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "people_name_idx" ON "people" USING btree ("legal_last_name","legal_first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profile_person_uq" ON "student_profiles" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_profile_number_uq" ON "student_profiles" USING btree ("student_number");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdiction_code_uq" ON "jurisdictions" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_person_org_uq" ON "memberships" USING btree ("person_id","organization_id");--> statement-breakpoint
CREATE INDEX "membership_org_idx" ON "memberships" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organization_parent_idx" ON "organizations" USING btree ("parent_organization_id");--> statement-breakpoint
CREATE INDEX "organization_type_idx" ON "organizations" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "program_org_slug_uq" ON "programs" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "program_site_idx" ON "programs" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "program_jurisdiction_idx" ON "programs" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "program_status_idx" ON "programs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "role_assignment_person_idx" ON "role_assignments" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "role_assignment_org_idx" ON "role_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "role_assignment_site_idx" ON "role_assignments" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "role_assignment_program_idx" ON "role_assignments" USING btree ("program_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_org_slug_uq" ON "sites" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "site_org_idx" ON "sites" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_calendar_day_uq" ON "academic_calendar_days" USING btree ("academic_calendar_id","calendar_date");--> statement-breakpoint
CREATE INDEX "academic_calendar_day_date_idx" ON "academic_calendar_days" USING btree ("calendar_date");--> statement-breakpoint
CREATE UNIQUE INDEX "academic_calendar_year_version_uq" ON "academic_calendars" USING btree ("school_year_id","version");--> statement-breakpoint
CREATE INDEX "academic_calendar_year_active_idx" ON "academic_calendars" USING btree ("school_year_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "grade_scale_org_name_version_uq" ON "grade_scales" USING btree ("owning_organization_id","name","version");--> statement-breakpoint
CREATE INDEX "grade_scale_org_active_idx" ON "grade_scales" USING btree ("owning_organization_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "grading_period_term_key_uq" ON "grading_periods" USING btree ("term_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "grading_period_term_sequence_uq" ON "grading_periods" USING btree ("term_id","sequence");--> statement-breakpoint
CREATE INDEX "grading_period_term_idx" ON "grading_periods" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_period_template_day_sequence_uq" ON "schedule_template_periods" USING btree ("schedule_template_id","day_of_week","sequence");--> statement-breakpoint
CREATE INDEX "schedule_period_template_idx" ON "schedule_template_periods" USING btree ("schedule_template_id");--> statement-breakpoint
CREATE INDEX "schedule_template_year_idx" ON "schedule_templates" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "schedule_template_program_active_idx" ON "schedule_templates" USING btree ("program_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "school_year_scope_key_uq" ON "school_years" USING btree ("organization_id","program_id","key");--> statement-breakpoint
CREATE INDEX "school_year_org_status_idx" ON "school_years" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "school_year_program_status_idx" ON "school_years" USING btree ("program_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "term_year_key_uq" ON "terms" USING btree ("school_year_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "term_year_sequence_uq" ON "terms" USING btree ("school_year_id","sequence");--> statement-breakpoint
CREATE INDEX "term_year_idx" ON "terms" USING btree ("school_year_id");--> statement-breakpoint
CREATE INDEX "assessment_section_idx" ON "assessments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "assessment_due_idx" ON "assessments" USING btree ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX "course_template_version_uq" ON "course_template_versions" USING btree ("course_template_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "course_template_org_code_uq" ON "course_templates" USING btree ("owning_organization_id","code");--> statement-breakpoint
CREATE INDEX "enrollment_student_idx" ON "enrollments" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "enrollment_program_idx" ON "enrollments" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "enrollment_section_idx" ON "enrollments" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "enrollment_status_idx" ON "enrollments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "enrollment_school_year_idx" ON "enrollments" USING btree ("school_year_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_teacher_uq" ON "section_teachers" USING btree ("section_id","person_id");--> statement-breakpoint
CREATE INDEX "section_teacher_person_idx" ON "section_teachers" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "section_program_term_code_uq" ON "sections" USING btree ("program_id","term_id","code");--> statement-breakpoint
CREATE INDEX "section_program_idx" ON "sections" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "section_term_idx" ON "sections" USING btree ("term_id");--> statement-breakpoint
CREATE UNIQUE INDEX "submission_attempt_uq" ON "submissions" USING btree ("assessment_id","student_profile_id","attempt_number");--> statement-breakpoint
CREATE INDEX "submission_student_idx" ON "submissions" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "submission_assessment_idx" ON "submissions" USING btree ("assessment_id");--> statement-breakpoint
CREATE INDEX "submission_status_idx" ON "submissions" USING btree ("status","timeliness");--> statement-breakpoint
CREATE INDEX "action_dependency_action_idx" ON "action_dependencies" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_dependency_blocker_idx" ON "action_dependencies" USING btree ("blocked_by_action_id");--> statement-breakpoint
CREATE INDEX "action_owner_status_idx" ON "actions" USING btree ("owner_person_id","status");--> statement-breakpoint
CREATE INDEX "action_subject_idx" ON "actions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "action_program_status_idx" ON "actions" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "audit_resource_idx" ON "audit_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "audit_actor_idx" ON "audit_events" USING btree ("actor_person_id","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_event_status_idx" ON "domain_events" USING btree ("status","occurred_at");--> statement-breakpoint
CREATE INDEX "domain_event_aggregate_idx" ON "domain_events" USING btree ("aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "journey_requirement_journey_idx" ON "journey_requirements" USING btree ("journey_id");--> statement-breakpoint
CREATE INDEX "journey_requirement_status_idx" ON "journey_requirements" USING btree ("status","blocking");--> statement-breakpoint
CREATE INDEX "journey_participant_idx" ON "journeys" USING btree ("participant_type","participant_id");--> statement-breakpoint
CREATE INDEX "journey_program_idx" ON "journeys" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "journey_status_idx" ON "journeys" USING btree ("status");--> statement-breakpoint
CREATE INDEX "notification_recipient_status_idx" ON "notifications" USING btree ("recipient_person_id","status");--> statement-breakpoint
CREATE INDEX "insight_subject_idx" ON "insights" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "insight_program_status_idx" ON "insights" USING btree ("program_id","status");--> statement-breakpoint
CREATE INDEX "communication_message_thread_idx" ON "communication_messages" USING btree ("thread_id","sent_at");--> statement-breakpoint
CREATE UNIQUE INDEX "communication_participant_uq" ON "communication_participants" USING btree ("thread_id","participant_type","participant_id");--> statement-breakpoint
CREATE INDEX "communication_context_idx" ON "communication_threads" USING btree ("context_type","context_id");--> statement-breakpoint
CREATE INDEX "attendance_student_time_idx" ON "attendance_events" USING btree ("student_profile_id","expected_at");--> statement-breakpoint
CREATE INDEX "attendance_occurrence_idx" ON "attendance_events" USING btree ("occurrence_key");--> statement-breakpoint
CREATE INDEX "attendance_program_time_idx" ON "attendance_events" USING btree ("program_id","expected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_source_key_uq" ON "attendance_events" USING btree ("source_key");--> statement-breakpoint
CREATE INDEX "attendance_supersedes_idx" ON "attendance_events" USING btree ("supersedes_attendance_event_id");--> statement-breakpoint
CREATE INDEX "attendance_excuse_event_idx" ON "attendance_excuses" USING btree ("attendance_event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "application_idempotency_uq" ON "applications" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "application_household_idx" ON "applications" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "application_student_idx" ON "applications" USING btree ("student_profile_id");--> statement-breakpoint
CREATE INDEX "application_program_stage_idx" ON "applications" USING btree ("program_id","stage");--> statement-breakpoint
CREATE INDEX "document_subject_idx" ON "documents" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "document_category_idx" ON "documents" USING btree ("category");--> statement-breakpoint
CREATE UNIQUE INDEX "journey_definition_key_version_uq" ON "journey_definitions" USING btree ("key","version");--> statement-breakpoint
CREATE INDEX "journey_definition_owner_idx" ON "journey_definitions" USING btree ("owning_organization_id");--> statement-breakpoint
CREATE INDEX "calendar_program_time_idx" ON "calendar_events" USING btree ("program_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_site_time_idx" ON "calendar_events" USING btree ("site_id","starts_at");--> statement-breakpoint
CREATE INDEX "calendar_source_idx" ON "calendar_events" USING btree ("source_type","source_id");