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
]);

export const programStatus = pgEnum("program_status", [
  "draft",
  "launching",
  "ready",
  "active",
  "paused",
  "closed",
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

export const communicationParticipantType = pgEnum("communication_participant_type", [
  "person",
  "household",
  "organization",
  "site",
  "program",
  "section",
]);
