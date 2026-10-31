/**
 * Read-only, student-specific bridge between institutional enrollment and
 * independently supervised onsite operation. Nothing in this projection
 * authorizes a child release, creates an attendance mark, or attests presence.
 */
export type FirstSchoolDayState =
  | "calendar_not_ready"
  | "not_scheduled"
  | "not_on_roster"
  | "placement_missing"
  | "supervision_unverified"
  | "staffing_plan_ready"
  | "attendance_recorded";

export type FirstSchoolDayProjection = {
  state: FirstSchoolDayState;
  message: string;
  studentExpected: boolean;
  supervisionPlanned: boolean;
  attendanceRecorded: boolean;
  outstandingGaps: string[];
};

/**
 * Always derive from the canonical date-specific roster and independently
 * reviewed staffing projection. An active enrollment or a section assignment
 * alone cannot be used as evidence of expected onsite attendance.
 */
export function deriveFirstSchoolDayHandoff(input: {
  programId: string;
  studentProfileId: string;
  configuration: string | null;
  expectedDays: number;
  students: readonly {
    studentProfileId: string;
    programId: string;
    sectionId: string | null;
    status: string;
  }[];
  blocks: readonly {
    sectionId: string;
    programId: string;
    periodId: string | null;
    assignedPlan: boolean;
    gaps: readonly string[];
  }[];
  projectionTruncated: boolean;
  /** A future forecast is never an attendance observation. */
  preparation?: boolean;
}): FirstSchoolDayProjection {
  const base = {studentExpected:false,supervisionPlanned:false,
    attendanceRecorded:false,outstandingGaps:[] as string[]};
  if (input.configuration !== "configured") {
    return { ...base,state:"calendar_not_ready",
      message:"The school-day calendar or onsite instruction schedule is not fully configured." };
  }
  if (input.expectedDays === 0) {
    return { ...base,state:"not_scheduled",
      message:"This is not a scheduled onsite instructional day for the selected Program." };
  }
  const student = input.students.find(row =>
    row.studentProfileId === input.studentProfileId && row.programId === input.programId);
  if (!student) {
    return { ...base,state:"not_on_roster",
      message:"This enrolled student is not on the selected day's expected onsite roster. Confirm the active school year, start date and instructional class placement." };
  }
  const attendanceRecorded = !input.preparation && ["present","tardy","absent","excused"].includes(student.status);
  if (!student.sectionId) {
    return { ...base,studentExpected:true,attendanceRecorded,state:"placement_missing",
      message:"The student is expected onsite but has no named instructional class. Resolve placement before relying on school-day preparation." };
  }
  const currentBlocks = input.blocks.filter(block =>
    block.programId === input.programId && block.sectionId === student.sectionId);
  if (input.projectionTruncated || !currentBlocks.length ||
      currentBlocks.some(block=>!block.periodId || !block.assignedPlan || block.gaps.length > 0)) {
    const outstandingGaps = [...new Set(currentBlocks.flatMap(block => block.gaps))];
    if (input.projectionTruncated) outstandingGaps.push("projection_incomplete");
    if (!currentBlocks.length) outstandingGaps.push("scheduled_supervision_missing");
    return {...base,studentExpected:true,attendanceRecorded,state:"supervision_unverified",
      outstandingGaps,
      message:"The student's scheduled Section lacks a complete independently reviewed supervision plan. The Site director must resolve staffing, room and safeguarding requirements."};
  }
  return { ...base,studentExpected:true,supervisionPlanned:true,attendanceRecorded,
    state:attendanceRecorded?"attendance_recorded":"staffing_plan_ready",
    message:attendanceRecorded
      ? "An authorized onsite attendance observation is recorded. This does not prove an adult's physical presence or custody release."
      : input.preparation
        ? "The future instructional roster and reviewed staffing plan align. No future attendance or physical presence has been observed."
        : "The roster and staffing plan align for today. Authorized onsite staff must still attest their physical presence and record observed attendance."};
}
