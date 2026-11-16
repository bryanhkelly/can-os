import { describe, expect, it } from "vitest";
import {
  assertNativeClassRepeatEligible, assertOperationalClassEnrollmentMethods,
  planNativeClassExit,
} from "./native-class-lifecycle";

describe("WS2 native Class enrollment lifecycle", () => {
  it("withdraws active participation and releases capacity", () => {
    expect(planNativeClassExit("active", "withdraw")).toEqual({
      enrollmentStatus:"withdrawn",attemptStatus:"withdrawn",
      releasedSeat:true,alreadyClosed:false,
    });
  });
  it("cancels a pending request without inventing a Course Attempt", () => {
    expect(planNativeClassExit("pending", "withdraw")).toEqual({
      enrollmentStatus:"cancelled",attemptStatus:null,
      releasedSeat:true,alreadyClosed:false,
    });
    expect(planNativeClassExit("pending", "cancel").enrollmentStatus).toBe("cancelled");
  });
  it("operator cancellation also withdraws the active Course Attempt", () => {
    expect(planNativeClassExit("active", "cancel")).toEqual({
      enrollmentStatus:"cancelled",attemptStatus:"withdrawn",
      releasedSeat:true,alreadyClosed:false,
    });
  });
  it("idempotent same-command retries produce no second seat release", () => {
    expect(planNativeClassExit("withdrawn", "withdraw").alreadyClosed).toBe(true);
    expect(planNativeClassExit("cancelled", "cancel").alreadyClosed).toBe(true);
  });
  it("never changes terminal results or resurrects historical enrollments", () => {
    for (const status of ["completed", "withdrawn", "cancelled"] as const) {
      for (const action of ["withdraw", "cancel"] as const) {
        if ((status==="withdrawn"&&action==="withdraw") ||
            (status==="cancelled"&&action==="cancel")) continue;
        expect(() => planNativeClassExit(status, action)).toThrow();
      }
    }
  });
  it("rejects non-operational publisher methods", () => {
    expect(() => assertOperationalClassEnrollmentMethods(["self","assignment"])).not.toThrow();
    for (const methods of [
      [],["invitation"],["approval"],["self","approval"],
      ["assignment","invitation"],["self","self"],
    ]) expect(() => assertOperationalClassEnrollmentMethods(methods)).toThrow();
  });
  it("allows new registration after withdrawal, not ungoverned completed repeat", () => {
    expect(() => assertNativeClassRepeatEligible(["withdrawn","cancelled"])).not.toThrow();
    expect(() => assertNativeClassRepeatEligible(["completed","withdrawn"])).toThrow();
  });
});
