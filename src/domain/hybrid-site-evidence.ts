/**
 * Hybrid sites need THREE separately sourced observations:
 * scheduled/expected onsite presence, staff-recorded onsite attendance,
 * and online learning evidence. Never infer one from the other.
 */
export type HybridLearnerObservation = {
  studentProfileId: string;
  expectedOnsite: boolean;
  onsiteAttendance: "present" | "absent" | "tardy" | "unrecorded";
  onlineInteractionsObserved: number;
};

export function summarizeHybridSiteDay(input: readonly HybridLearnerObservation[]) {
  const seen = new Set<string>();
  for (const row of input) {
    if (!row.studentProfileId || seen.has(row.studentProfileId) ||
        !Number.isSafeInteger(row.onlineInteractionsObserved) ||
        row.onlineInteractionsObserved < 0) {
      throw new Error("Invalid hybrid-site observation set");
    }
    seen.add(row.studentProfileId);
  }
  const expected = input.filter(row => row.expectedOnsite);
  const onsite = expected.filter(row =>
    row.onsiteAttendance === "present" || row.onsiteAttendance === "tardy");
  const missingOnsiteRecords = expected.filter(row => row.onsiteAttendance === "unrecorded");
  return {
    expectedOnsite: expected.length,
    verifiedOnsiteObservations: onsite.length,
    onsiteAbsentRecorded: expected.filter(row => row.onsiteAttendance === "absent").length,
    onsiteRecordsToReview: missingOnsiteRecords.map(row => row.studentProfileId),
    onlineEvidenceStudents: input.filter(row => row.onlineInteractionsObserved > 0).length,
    distinctStudents: input.length,
    note: "Online activity is not onsite attendance. Unrecorded activity is not evidence of absence. Attendance authority remains with the configured school/site workflow.",
  };
}
