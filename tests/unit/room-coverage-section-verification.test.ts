import { describe, expect, it, vi } from "vitest";
import { scheduledBlockHasNamedFacilitator } from "@/modules/operations/section-coverage-verification.server";

vi.mock("@/db/client", () => ({ db: {} }));
const window = {
  startsOn: "2026-11-03", endsOn: "2026-12-03", weekdays: [2, 3, 4],
  startsAtLocal: "08:00", endsAtLocal: "14:00",
};
const input = {
  programId: "program", sectionId: "11111111-1111-4111-8111-111111111111",
  personId: "22222222-2222-4222-8222-222222222222",
  date: "2026-11-03", timeZone: "America/Los_Angeles", startsAtLocal: "09:00", endsAtLocal: "10:00",
};
const term = {
  id: "coverage:2", effectiveFrom: new Date("2026-11-03T08:00:00Z"),
  effectiveThrough: new Date("2026-12-04T08:00:00Z"), roomCoverage: window,
};
const key = `program:room_facilitator:${input.sectionId}:${input.personId}`;

describe("named recurring room assignments across instructional Sections", () => {
  it("requires the named person, school-local weekday and the complete block", () => {
    const verified = new Map([[key, term]]);
    expect(scheduledBlockHasNamedFacilitator(verified, input)).toBe(true);
    for (const patch of [
      { personId: "33333333-3333-4333-8333-333333333333" },
      { sectionId: "33333333-3333-4333-8333-333333333333" }, { programId: "other" },
      { date: "2026-11-06" }, { startsAtLocal: "07:59" }, { endsAtLocal: "14:00:01" },
      { startsAtLocal: null }, { date: "2026-12-08" },
    ]) expect(scheduledBlockHasNamedFacilitator(verified, { ...input, ...patch })).toBe(false);
  });
  it("retains both nonoverlapping assignments instead of overwriting one with the other", () => {
    const verified = new Map([[key, { ...term,
      roomCoverage: { ...window, endsAtLocal: "10:00" },
      alternatives: [{ ...term, id: "afternoon:1",
        roomCoverage: { ...window, startsAtLocal: "10:00" } }],
    }]]);
    expect(scheduledBlockHasNamedFacilitator(verified, input)).toBe(true);
    expect(scheduledBlockHasNamedFacilitator(verified, {
      ...input, startsAtLocal: "12:00", endsAtLocal: "14:00",
    })).toBe(true);
    expect(scheduledBlockHasNamedFacilitator(verified, {
      ...input, startsAtLocal: "09:00", endsAtLocal: "11:00",
    })).toBe(false);
  });
});
