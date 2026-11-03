export const clientErrorCodes = [
  "AUTHENTICATION_REQUIRED", "FORBIDDEN", "VALIDATION_FAILED", "CONFLICT",
  "UNAVAILABLE", "CANCELLED", "UNEXPECTED",
  "COURSE_CONTENT_REQUIRED", "COURSE_STAFFING_REQUIRED", "COURSE_CAPACITY_REACHED",
  "COURSE_CREDIT_LIMIT", "COURSE_SCHEDULE_CONFLICT", "COURSE_PREREQUISITES_REQUIRED",
  "COURSE_REGISTRATION_CLOSED", "COURSE_PROGRAM_REQUIRED",
  "SITE_ROOM_NAME_CONFLICT", "SITE_ROOM_IDENTIFIER_CONFLICT",
  "SITE_ROOM_RETIRED",
  "CONFERENCE_NOT_BOOKED", "CONFERENCE_NOT_STARTED", "CONFERENCE_NOT_ENDED",
  "ATTENDANCE_CONFLICT",
] as const;
export type ClientErrorCode = typeof clientErrorCodes[number];

export const clientErrorMessages: Record<ClientErrorCode, string> = {
  AUTHENTICATION_REQUIRED: "Sign in with an authorized account to continue.",
  FORBIDDEN: "You do not have permission to perform this operation.",
  VALIDATION_FAILED: "Check the entered information and try again.",
  CONFLICT: "This record has changed. Refresh the page before trying again.",
  UNAVAILABLE: "This information is temporarily unavailable.",
  CANCELLED: "The upload was cancelled. Retry when you are ready.",
  UNEXPECTED: "An unexpected error occurred. Please try again.",
  COURSE_CONTENT_REQUIRED: "Publish a course version with at least one student-accessible instructional lesson before placing students in this class.",
  COURSE_STAFFING_REQUIRED: "Assign an active teacher with verified school access, qualifications and delivery coverage for the instructional term before placing students in this class.",
  COURSE_CAPACITY_REACHED: "This class is full. Review its enrollment capacity before approving another placement.",
  COURSE_CREDIT_LIMIT: "This addition would exceed the student's term credit limit. Review the student's schedule and the course registration policy.",
  COURSE_SCHEDULE_CONFLICT: "This class conflicts with the student's current timetable. Resolve the schedule conflict before approving the addition.",
  COURSE_PREREQUISITES_REQUIRED: "The student has not completed this class's prerequisites. Review the registration policy and finalized academic records.",
  COURSE_REGISTRATION_CLOSED: "The add/drop deadline has passed. Review the course registration policy before requesting another addition.",
  COURSE_PROGRAM_REQUIRED: "The student needs an active enrollment in this class's program and school year before placement.",
  SITE_ROOM_NAME_CONFLICT: "A room with this name already exists at this Site. Use the saved room.",
  SITE_ROOM_IDENTIFIER_CONFLICT: "This room identifier was already used for different details. Refresh the room directory before continuing.",
  SITE_ROOM_RETIRED: "This classroom is retired. Select an active room or ask the school registrar to review classroom setup.",
  CONFERENCE_NOT_BOOKED: "Only a booked conference can have an outcome recorded. Refresh the appointment list.",
  CONFERENCE_NOT_STARTED: "A conference outcome cannot be recorded before the appointment starts.",
  CONFERENCE_NOT_ENDED: "A no-show cannot be recorded before the appointment ends.",
  ATTENDANCE_CONFLICT: "The school attendance record changed after this entry was prepared. Refresh and review the conflict before trying again.",
};

/** Diagnostic messages stay on the server; clients use the explicit code. */
export class DomainError extends Error {
  readonly code: string;
  constructor(code: ClientErrorCode, diagnostic?: string) {
    super(diagnostic ?? clientErrorMessages[code]);
    this.code = code;
    this.name = "DomainError";
  }
}
