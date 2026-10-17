-- Remove the legacy text CHECK before converting status to a native PostgreSQL enum.
-- The enum supplies the permitted status values after conversion.
ALTER TABLE "admission_offers" DROP CONSTRAINT IF EXISTS "admission_offer_valid_status";--> statement-breakpoint
CREATE TYPE "public"."activity_eligibility_check_status" AS ENUM('eligible', 'ineligible', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."activity_eligibility_status" AS ENUM('pending', 'eligible', 'ineligible', 'conditional');--> statement-breakpoint
CREATE TYPE "public"."activity_registration_status" AS ENUM('pending', 'waitlisted', 'eligible', 'ineligible', 'conditional', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."activity_roster_status" AS ENUM('not_rostered');--> statement-breakpoint
CREATE TYPE "public"."activity_season_status" AS ENUM('registration');--> statement-breakpoint
CREATE TYPE "public"."activity_status" AS ENUM('active');--> statement-breakpoint
CREATE TYPE "public"."admission_offer_status" AS ENUM('draft', 'issued', 'accepted', 'declined', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."calendar_participant_response_status" AS ENUM('none', 'accepted');--> statement-breakpoint
CREATE TYPE "public"."compliance_framework_version_status" AS ENUM('draft');--> statement-breakpoint
CREATE TYPE "public"."conference_booking_status" AS ENUM('booked', 'held', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."conference_series_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."conference_slot_status" AS ENUM('available', 'booked');--> statement-breakpoint
CREATE TYPE "public"."course_template_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TYPE "public"."field_trip_attendance_status" AS ENUM('present', 'absent', 'boarded', 'returned');--> statement-breakpoint
CREATE TYPE "public"."field_trip_participant_status" AS ENUM('invited', 'permission_complete');--> statement-breakpoint
CREATE TYPE "public"."field_trip_status" AS ENUM('proposed', 'approved');--> statement-breakpoint
CREATE TYPE "public"."financial_obligation_status" AS ENUM('due');--> statement-breakpoint
CREATE TYPE "public"."health_compliance_status" AS ENUM('missing', 'pending_review', 'compliant', 'expired', 'waived');--> statement-breakpoint
CREATE TYPE "public"."incident_notification_status" AS ENUM('pending');--> statement-breakpoint
CREATE TYPE "public"."incident_review_status" AS ENUM('pending', 'complete');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('filed', 'closed');--> statement-breakpoint
CREATE TYPE "public"."insight_status" AS ENUM('open', 'acknowledged', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."medication_authorization_status" AS ENUM('active');--> statement-breakpoint
CREATE TYPE "public"."return_to_school_clearance_status" AS ENUM('required', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."school_configuration_status" AS ENUM('draft');--> statement-breakpoint
CREATE TYPE "public"."section_grade_status" AS ENUM('draft', 'finalized');--> statement-breakpoint
CREATE TYPE "public"."study_group_membership_status" AS ENUM('pending', 'approved', 'declined', 'left');--> statement-breakpoint
CREATE TYPE "public"."study_group_report_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."study_group_status" AS ENUM('active');--> statement-breakpoint
CREATE TYPE "public"."support_referral_stage" AS ENUM('submitted', 'accepted', 'plan_created', 'in_service', 'review', 'closed');--> statement-breakpoint
CREATE TYPE "public"."support_service_status" AS ENUM('scheduled', 'completed');--> statement-breakpoint
ALTER TABLE "course_template_versions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."course_template_version_status";--> statement-breakpoint
ALTER TABLE "course_template_versions" ALTER COLUMN "status" SET DATA TYPE "public"."course_template_version_status" USING "status"::"public"."course_template_version_status";--> statement-breakpoint
ALTER TABLE "insights" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."insight_status";--> statement-breakpoint
ALTER TABLE "insights" ALTER COLUMN "status" SET DATA TYPE "public"."insight_status" USING "status"::"public"."insight_status";--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ALTER COLUMN "response_status" SET DEFAULT 'none'::"public"."calendar_participant_response_status";--> statement-breakpoint
ALTER TABLE "calendar_event_participants" ALTER COLUMN "response_status" SET DATA TYPE "public"."calendar_participant_response_status" USING "response_status"::"public"."calendar_participant_response_status";--> statement-breakpoint
ALTER TABLE "financial_obligations" ALTER COLUMN "status" SET DEFAULT 'due'::"public"."financial_obligation_status";--> statement-breakpoint
ALTER TABLE "financial_obligations" ALTER COLUMN "status" SET DATA TYPE "public"."financial_obligation_status" USING "status"::"public"."financial_obligation_status";--> statement-breakpoint
ALTER TABLE "incident_notifications" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."incident_notification_status";--> statement-breakpoint
ALTER TABLE "incident_notifications" ALTER COLUMN "status" SET DATA TYPE "public"."incident_notification_status" USING "status"::"public"."incident_notification_status";--> statement-breakpoint
ALTER TABLE "incident_reviews" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."incident_review_status";--> statement-breakpoint
ALTER TABLE "incident_reviews" ALTER COLUMN "status" SET DATA TYPE "public"."incident_review_status" USING "status"::"public"."incident_review_status";--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "status" SET DEFAULT 'filed'::"public"."incident_status";--> statement-breakpoint
ALTER TABLE "incidents" ALTER COLUMN "status" SET DATA TYPE "public"."incident_status" USING "status"::"public"."incident_status";--> statement-breakpoint
ALTER TABLE "health_compliance_items" ALTER COLUMN "status" SET DEFAULT 'missing'::"public"."health_compliance_status";--> statement-breakpoint
ALTER TABLE "health_compliance_items" ALTER COLUMN "status" SET DATA TYPE "public"."health_compliance_status" USING "status"::"public"."health_compliance_status";--> statement-breakpoint
ALTER TABLE "medication_authorizations" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."medication_authorization_status";--> statement-breakpoint
ALTER TABLE "medication_authorizations" ALTER COLUMN "status" SET DATA TYPE "public"."medication_authorization_status" USING "status"::"public"."medication_authorization_status";--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ALTER COLUMN "status" SET DEFAULT 'required'::"public"."return_to_school_clearance_status";--> statement-breakpoint
ALTER TABLE "return_to_school_clearances" ALTER COLUMN "status" SET DATA TYPE "public"."return_to_school_clearance_status" USING "status"::"public"."return_to_school_clearance_status";--> statement-breakpoint
ALTER TABLE "field_trip_attendance" ALTER COLUMN "status" SET DATA TYPE "public"."field_trip_attendance_status" USING "status"::"public"."field_trip_attendance_status";--> statement-breakpoint
ALTER TABLE "field_trip_participants" ALTER COLUMN "status" SET DEFAULT 'invited'::"public"."field_trip_participant_status";--> statement-breakpoint
ALTER TABLE "field_trip_participants" ALTER COLUMN "status" SET DATA TYPE "public"."field_trip_participant_status" USING "status"::"public"."field_trip_participant_status";--> statement-breakpoint
ALTER TABLE "field_trips" ALTER COLUMN "status" SET DEFAULT 'proposed'::"public"."field_trip_status";--> statement-breakpoint
ALTER TABLE "field_trips" ALTER COLUMN "status" SET DATA TYPE "public"."field_trip_status" USING "status"::"public"."field_trip_status";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."activity_status";--> statement-breakpoint
ALTER TABLE "activities" ALTER COLUMN "status" SET DATA TYPE "public"."activity_status" USING "status"::"public"."activity_status";--> statement-breakpoint
ALTER TABLE "activity_eligibility_checks" ALTER COLUMN "status" SET DATA TYPE "public"."activity_eligibility_check_status" USING "status"::"public"."activity_eligibility_check_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."activity_registration_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "status" SET DATA TYPE "public"."activity_registration_status" USING "status"::"public"."activity_registration_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "eligibility_status" SET DEFAULT 'pending'::"public"."activity_eligibility_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "eligibility_status" SET DATA TYPE "public"."activity_eligibility_status" USING "eligibility_status"::"public"."activity_eligibility_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "roster_status" SET DEFAULT 'not_rostered'::"public"."activity_roster_status";--> statement-breakpoint
ALTER TABLE "activity_registrations" ALTER COLUMN "roster_status" SET DATA TYPE "public"."activity_roster_status" USING "roster_status"::"public"."activity_roster_status";--> statement-breakpoint
ALTER TABLE "activity_seasons" ALTER COLUMN "status" SET DEFAULT 'registration'::"public"."activity_season_status";--> statement-breakpoint
ALTER TABLE "activity_seasons" ALTER COLUMN "status" SET DATA TYPE "public"."activity_season_status" USING "status"::"public"."activity_season_status";--> statement-breakpoint
ALTER TABLE "conference_bookings" ALTER COLUMN "status" SET DEFAULT 'booked'::"public"."conference_booking_status";--> statement-breakpoint
ALTER TABLE "conference_bookings" ALTER COLUMN "status" SET DATA TYPE "public"."conference_booking_status" USING "status"::"public"."conference_booking_status";--> statement-breakpoint
ALTER TABLE "conference_series" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."conference_series_status";--> statement-breakpoint
ALTER TABLE "conference_series" ALTER COLUMN "status" SET DATA TYPE "public"."conference_series_status" USING "status"::"public"."conference_series_status";--> statement-breakpoint
ALTER TABLE "conference_slots" ALTER COLUMN "status" SET DEFAULT 'available'::"public"."conference_slot_status";--> statement-breakpoint
ALTER TABLE "conference_slots" ALTER COLUMN "status" SET DATA TYPE "public"."conference_slot_status" USING "status"::"public"."conference_slot_status";--> statement-breakpoint
ALTER TABLE "compliance_framework_versions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."compliance_framework_version_status";--> statement-breakpoint
ALTER TABLE "compliance_framework_versions" ALTER COLUMN "status" SET DATA TYPE "public"."compliance_framework_version_status" USING "status"::"public"."compliance_framework_version_status";--> statement-breakpoint
ALTER TABLE "school_configuration_versions" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."school_configuration_status";--> statement-breakpoint
ALTER TABLE "school_configuration_versions" ALTER COLUMN "status" SET DATA TYPE "public"."school_configuration_status" USING "status"::"public"."school_configuration_status";--> statement-breakpoint
ALTER TABLE "admission_offers" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."admission_offer_status";--> statement-breakpoint
ALTER TABLE "admission_offers" ALTER COLUMN "status" SET DATA TYPE "public"."admission_offer_status" USING "status"::"public"."admission_offer_status";--> statement-breakpoint
ALTER TABLE "study_group_memberships" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."study_group_membership_status";--> statement-breakpoint
ALTER TABLE "study_group_memberships" ALTER COLUMN "status" SET DATA TYPE "public"."study_group_membership_status" USING "status"::"public"."study_group_membership_status";--> statement-breakpoint
ALTER TABLE "study_group_reports" ALTER COLUMN "status" SET DEFAULT 'open'::"public"."study_group_report_status";--> statement-breakpoint
ALTER TABLE "study_group_reports" ALTER COLUMN "status" SET DATA TYPE "public"."study_group_report_status" USING "status"::"public"."study_group_report_status";--> statement-breakpoint
ALTER TABLE "study_groups" ALTER COLUMN "status" SET DEFAULT 'active'::"public"."study_group_status";--> statement-breakpoint
ALTER TABLE "study_groups" ALTER COLUMN "status" SET DATA TYPE "public"."study_group_status" USING "status"::"public"."study_group_status";--> statement-breakpoint
ALTER TABLE "section_grades" ALTER COLUMN "status" SET DEFAULT 'draft'::"public"."section_grade_status";--> statement-breakpoint
ALTER TABLE "section_grades" ALTER COLUMN "status" SET DATA TYPE "public"."section_grade_status" USING "status"::"public"."section_grade_status";--> statement-breakpoint
ALTER TABLE "support_referral_stage_events" ALTER COLUMN "stage" SET DATA TYPE "public"."support_referral_stage" USING "stage"::"public"."support_referral_stage";--> statement-breakpoint
ALTER TABLE "support_referrals" ALTER COLUMN "stage" SET DEFAULT 'submitted'::"public"."support_referral_stage";--> statement-breakpoint
ALTER TABLE "support_referrals" ALTER COLUMN "stage" SET DATA TYPE "public"."support_referral_stage" USING "stage"::"public"."support_referral_stage";--> statement-breakpoint
ALTER TABLE "support_services" ALTER COLUMN "status" SET DEFAULT 'scheduled'::"public"."support_service_status";--> statement-breakpoint
ALTER TABLE "support_services" ALTER COLUMN "status" SET DATA TYPE "public"."support_service_status" USING "status"::"public"."support_service_status";