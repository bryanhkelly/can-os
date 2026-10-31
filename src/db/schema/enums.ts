import { pgEnum } from "drizzle-orm/pg-core";

export const organizationType = pgEnum("organization_type", [
  "can_network",
  "denomination",
  "church",
  "christian_school",
  "microschool_operator",
  "consortium",
  "other_partner",
]);

export const programType = pgEnum("program_type", [
  "church_hosted_academy",
  "high_school_extension",
  "full_school",
  "microschool",
  "hybrid_program",
  "homeschool_cohort",
  "summer_enrichment",
  "summer_program",
  "after_school_enrichment",
]);

export const programStatus = pgEnum("program_status", [
  "draft",
  "launching",
  "ready",
  "active",
  "paused",
  "closed",
]);

export const schoolYearStatus = pgEnum("school_year_status", [
  "draft",
  "ready",
  "active",
  "closed",
]);

export const instructionalDayType = pgEnum("instructional_day_type", [
  "instructional",
  "holiday",
  "closure",
  "special",
  "makeup",
]);

export const applicationStage = pgEnum("application_stage", [
  "lead",
  "inquiry",
  "application",
  "eligibility",
  "accepted",
  "declined",
  "withdrawn",
]);

export const enrollmentKind = pgEnum("enrollment_kind", [
  "program",
  "school_year",
  "section",
]);

export const enrollmentStatus = pgEnum("enrollment_status", [
  "applicant",
  "accepted",
  "active",
  "transferred",
  "withdrawn",
  "graduated",
  "cancelled",
]);

export const actionStatus = pgEnum("action_status", [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "cancelled",
]);

export const actionPriority = pgEnum("action_priority", [
  "low",
  "normal",
  "high",
  "urgent",
]);

export const journeyStatus = pgEnum("journey_status", [
  "not_started",
  "in_progress",
  "blocked",
  "ready",
  "active",
  "complete",
  "cancelled",
]);

export const journeyRequirementStatus = pgEnum("journey_requirement_status", [
  "needs_you",
  "needs_can",
  "waiting_third_party",
  "blocked",
  "complete",
]);

export const assessmentStatus = pgEnum("assessment_status", [
  "draft",
  "published",
  "closed",
  "archived",
]);

export const submissionStatus = pgEnum("submission_status", [
  "assigned",
  "submitted",
  "graded",
  "returned",
]);

export const submissionTimeliness = pgEnum("submission_timeliness", [
  "on_time",
  "late",
  "missing",
  "excused",
]);

export const attendanceStatus = pgEnum("attendance_status", [
  "expected",
  "present",
  "absent",
  "tardy",
  "excused",
]);

export const excuseStatus = pgEnum("attendance_excuse_status", [
  "submitted",
  "approved",
  "rejected",
  "withdrawn",
]);

export const domainEventStatus = pgEnum("domain_event_status", [
  "pending",
  "processing",
  "processed",
  "failed",
]);

export const notificationStatus = pgEnum("notification_status", [
  "unread",
  "read",
  "dismissed",
]);

export const subscriptionStatus = pgEnum("subscription_status", [
  "active",
  "paused",
  "revoked",
  "expired",
]);

export const subscriptionChannel = pgEnum("subscription_channel", [
  "in_app",
  "email",
  "sms",
  "agent_webhook",
]);

export const subscriptionDeliveryStatus = pgEnum("subscription_delivery_status", [
  "pending",
  "processing",
  "delivered",
  "suppressed",
  "failed",
]);

export const conversationRole = pgEnum("conversation_role", [
  "user",
  "agent",
  "system",
]);

export const conversationStatus = pgEnum("conversation_status", [
  "active",
  "archived",
]);

export const agentRunIntent = pgEnum("agent_run_intent", [
  "ask",
  "do",
  "watch",
  "manage",
]);

export const agentRunStatus = pgEnum("agent_run_status", [
  "planning",
  "awaiting_approval",
  "executing",
  "completed",
  "failed",
  "cancelled",
]);

export const communicationParticipantType = pgEnum("communication_participant_type", [
  "person",
  "household",
  "organization",
  "site",
  "program",
  "section",
]);

export const courseTemplateVersionStatus = pgEnum("course_template_version_status", [
  "draft",
  "published",
]);

export const activityStatus = pgEnum("activity_status", ["active"]);

export const activitySeasonStatus = pgEnum("activity_season_status", ["registration", "draft"]);

export const activityRegistrationStatus = pgEnum("activity_registration_status", [
  "pending",
  "waitlisted",
  "eligible",
  "ineligible",
  "conditional",
  "withdrawn",
]);

export const activityEligibilityStatus = pgEnum("activity_eligibility_status", [
  "pending",
  "eligible",
  "ineligible",
  "conditional",
]);

export const activityRosterStatus = pgEnum("activity_roster_status", ["not_rostered"]);

export const activityEligibilityCheckStatus = pgEnum("activity_eligibility_check_status", [
  "eligible",
  "ineligible",
  "conditional",
]);

export const admissionOfferStatus = pgEnum("admission_offer_status", [
  "draft",
  "issued",
  "accepted",
  "declined",
  "expired",
  "revoked",
]);

export const calendarParticipantResponseStatus = pgEnum("calendar_participant_response_status", [
  "none",
  "accepted",
]);

export const conferenceSeriesStatus = pgEnum("conference_series_status", [
  "draft",
  "published",
]);

export const conferenceSlotStatus = pgEnum("conference_slot_status", [
  "available",
  "booked",
]);

export const conferenceBookingStatus = pgEnum("conference_booking_status", [
  "booked",
  "held",
  "no_show",
  "cancelled",
]);

export const fieldTripStatus = pgEnum("field_trip_status", [
  "proposed",
  "approved",
]);

export const fieldTripParticipantStatus = pgEnum("field_trip_participant_status", [
  "invited",
  "permission_complete",
  "declined",
]);

export const fieldTripAttendanceStatus = pgEnum("field_trip_attendance_status", [
  "present",
  "absent",
  "boarded",
  "returned",
]);

export const financialObligationStatus = pgEnum("financial_obligation_status", ["due"]);

export const healthComplianceStatus = pgEnum("health_compliance_status", [
  "missing",
  "pending_review",
  "compliant",
  "expired",
  "waived",
]);

export const medicationAuthorizationStatus = pgEnum("medication_authorization_status", [
  "active",
]);

export const returnToSchoolClearanceStatus = pgEnum("return_to_school_clearance_status", [
  "required",
  "cleared",
]);

export const incidentStatus = pgEnum("incident_status", ["filed", "closed"]);

export const incidentReviewStatus = pgEnum("incident_review_status", [
  "pending",
  "complete",
]);

export const incidentNotificationStatus = pgEnum("incident_notification_status", ["pending"]);

export const insightStatus = pgEnum("insight_status", [
  "open",
  "acknowledged",
  "dismissed",
]);

export const schoolConfigurationStatus = pgEnum("school_configuration_status", ["draft", "approved", "suspended"]);

export const complianceFrameworkVersionStatus = pgEnum("compliance_framework_version_status", [
  "draft",
  "published",
]);

export const sectionGradeStatus = pgEnum("section_grade_status", ["draft", "finalized"]);

export const studyGroupStatus = pgEnum("study_group_status", ["active"]);

export const studyGroupMembershipStatus = pgEnum("study_group_membership_status", [
  "pending",
  "approved",
  "declined",
  "left",
]);

export const studyGroupReportStatus = pgEnum("study_group_report_status", [
  "open",
  "resolved",
]);

export const supportReferralStage = pgEnum("support_referral_stage", [
  "submitted",
  "accepted",
  "plan_created",
  "in_service",
  "review",
  "closed",
]);

export const supportServiceStatus = pgEnum("support_service_status", [
  "scheduled",
  "completed",
]);

export const capacityOfferingStatus = pgEnum("capacity_offering_status", ["open"]);

export const capacityDemandStatus = pgEnum("capacity_demand_status", ["open"]);

export const capacityReservationStatus = pgEnum("capacity_reservation_status", [
  "held",
  "committed",
  "released",
]);

export const deliveryArrangementStatus = pgEnum("delivery_arrangement_status", [
  "proposed",
  "reserved",
  "ready",
  "active",
  "completed",
]);
