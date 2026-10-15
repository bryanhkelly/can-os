export const EventTypes = {
  ApplicationStarted: "ApplicationStarted",
  ApplicationAccepted: "ApplicationAccepted",
  JourneyRequirementCompleted: "JourneyRequirementCompleted",
  JourneyReady: "JourneyReady",
  AssessmentPublished: "AssessmentPublished",
  AssignmentBecameMissing: "AssignmentBecameMissing",
  SubmissionReceived: "SubmissionReceived",
  GradePosted: "GradePosted",
  CommunicationMessageSent: "CommunicationMessageSent",
  InsightCreated: "InsightCreated",
  ActionCreated: "ActionCreated",
  ActionResolved: "ActionResolved",
  EnrollmentActivated: "EnrollmentActivated",
  ProgramActivated: "ProgramActivated",
  StudentMarkedAbsent: "StudentMarkedAbsent",
  AttendanceExcuseSubmitted: "AttendanceExcuseSubmitted",
  AttendanceExcuseApproved: "AttendanceExcuseApproved",
  AttendanceExcuseRejected: "AttendanceExcuseRejected",
} as const;

export type EventType = (typeof EventTypes)[keyof typeof EventTypes];
