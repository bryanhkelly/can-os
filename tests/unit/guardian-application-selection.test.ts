import { describe, expect, it } from "vitest";
import { guardianApplicationSelection } from "../../src/domain/guardian-application-selection";
const first = { id: "school", schoolYears: [{ id: "year", name: "2027–28" }] };
const other = { id: "other", schoolYears: [{ id: "other-year", name: "2027–28" }] };
const empty = { programId: "", schoolYearId: "" };
describe("guardian application destination selection", () => {
  it("does not substitute another school for an unavailable invitation target", () => {
    const result = guardianApplicationSelection([other], { ...empty,
      requestedProgramId: first.id, familyStartRequestId: "verified-request" });
    expect(result.unavailable).toBe(true);
    expect(result.programs).toEqual([]);
    expect(result.program).toBeUndefined();
  });
  it("binds a verified invitation to its intended Program", () => {
    const result = guardianApplicationSelection([first, other], { ...empty,
      requestedProgramId: first.id, familyStartRequestId: "verified-request", programId: other.id });
    expect(result.programs).toEqual([first]);
    expect(result.program).toBeUndefined();
  });
  it("rejects orphaned invitation provenance", () => {
    expect(guardianApplicationSelection([first], { ...empty, programId: first.id,
      familyStartRequestId: "verified-request" }).unavailable).toBe(true);
  });
  it("suggests the only configured year of the chosen Program", () => {
    expect(guardianApplicationSelection([first, other], { ...empty, programId: first.id }).year?.id).toBe("year");
  });
  it("does not reuse a stale year from another Program", () => {
    expect(guardianApplicationSelection([first, other], { programId: other.id, schoolYearId: "year" }).year).toBeUndefined();
  });
  it("requires a year choice when several are open", () => {
    const program = { ...first, schoolYears: [...first.schoolYears, { id: "next-year", name: "2028–29" }] };
    expect(guardianApplicationSelection([program], { ...empty, programId: first.id }).year).toBeUndefined();
  });
  it("permits an explicit school selection without invitation provenance", () => {
    const result = guardianApplicationSelection([first, other], { ...empty,
      requestedProgramId: first.id, programId: other.id });
    expect(result.unavailable).toBe(false);
    expect(result.program).toEqual(other);
  });
});

