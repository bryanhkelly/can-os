import { describe, expect, it } from "vitest";
import { coveringInstructorIds } from "@/modules/staffing/instructional-coverage";

const window = {
  from: new Date("2027-08-16T07:00:00.000Z"),
  through: new Date("2027-12-19T07:59:59.000Z"),
};
const arrangement = {
  instructorPersonId: "teacher",
  effectiveFrom: window.from,
  effectiveThrough: window.through,
};

describe("instructional delivery coverage", () => {
  it("accepts an assigned instructor covering the exact instructional window", () => {
    expect(coveringInstructorIds(window, ["teacher"], [arrangement])).toEqual(new Set(["teacher"]));
  });

  it("accepts an arrangement extending beyond the instructional window", () => {
    expect(coveringInstructorIds(window, ["teacher"], [{
      ...arrangement,
      effectiveFrom: new Date("2027-01-01T00:00:00.000Z"),
      effectiveThrough: new Date("2028-01-01T00:00:00.000Z"),
    }])).toEqual(new Set(["teacher"]));
  });

  it.each([
    ["starts late", { effectiveFrom: new Date("2027-08-17T00:00:00.000Z") }],
    ["ends early", { effectiveThrough: new Date("2027-12-18T00:00:00.000Z") }],
    ["has no instructor", { instructorPersonId: null }],
    ["belongs to another instructor", { instructorPersonId: "other" }],
  ])("rejects an arrangement that %s", (_label, override) => {
    expect(coveringInstructorIds(window, ["teacher"], [{ ...arrangement, ...override }])).toEqual(new Set());
  });

  it("keeps coverage attached to each individual instructor", () => {
    expect(coveringInstructorIds(window, ["covered", "uncovered"], [
      { ...arrangement, instructorPersonId: "covered" },
    ])).toEqual(new Set(["covered"]));
  });
});
