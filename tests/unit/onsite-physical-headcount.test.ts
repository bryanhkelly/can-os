import { describe, expect, it } from "vitest";
import { deriveOnsiteObservedHeadcount } from "@/domain/onsite-physical-headcount";

const student = (studentProfileId: string, programId: string, status: string, recorded = true) => ({
  studentProfileId, programId, status, attendanceEventId: recorded ? "recorded-event" : null,
});

describe("onsite distinct headcount from authenticated roster facts", () => {
  it("deduplicates the same student across Programs while retaining all roster marks", () => {
    const result = deriveOnsiteObservedHeadcount([
      student("a", "math", "present"), student("a", "summer", "present"),
      student("b", "summer", "tardy"), student("c", "summer", "absent"),
    ]);
    expect(result.scopedRosterEntries).toBe(4);
    expect(result.distinctExpectedStudents).toBe(3);
    expect(result.observedOnsiteStudents).toBe(2);
    expect(result.recordedAwayOnlyStudents).toBe(1);
    expect(result.sharedProgramStudents).toBe(1);
    expect(result.currentPhysicalHeadcountVerified).toBe(false);
  });

  it("does not count unmarked/unauthenticated marks or claimed status without evidence", () => {
    const result = deriveOnsiteObservedHeadcount([
      student("a", "math", "present", false),
      student("b", "summer", "expected", false),
      student("c", "summer", "present"),
      student("d", "summer", "absent"),
    ]);
    expect(result.observedOnsiteStudents).toBe(1);
    expect(result.studentsWithIncompleteMarks).toBe(2);
    expect(result.distinctExpectedStudents).toBe(4);
  });

  it("flags contradictory Program observations without asserting a current headcount", () => {
    const result = deriveOnsiteObservedHeadcount([
      student("a", "math", "present"), student("a", "art", "absent"),
      student("b", "math", "present"), student("b", "art", "expected", false),
    ]);
    expect(result.conflictingObservations).toBe(1);
    expect(result.studentsWithIncompleteMarks).toBe(1);
    expect(result.observedOnsiteStudents).toBe(2);
    expect(result.currentPhysicalHeadcountVerified).toBe(false);
  });
});
