import { beforeEach, describe, expect, it, vi } from "vitest";
import { readApprovedPublicParentExtras } from "@/modules/sites/public-parent-extras.server";
import { readApprovedPublicSchoolDay } from "@/modules/academic-time/public-school-day.server";

vi.mock("@/modules/academic-time/public-school-day.server", () => ({
  readApprovedPublicSchoolDay: vi.fn(),
}));

const siteId = "00000000-0000-4000-8000-000000000001";
const approvedSchedule = {
  state: "approved", timezone: "America/Los_Angeles",
  days: {value: [0, 3], source: "calendar", revision: 2, audience: "public",
    status: "verified", canDisplay: true},
};
const metadata = {
  familyServices: {
    version: 1, revision: 3,
    reviewedByPersonId: "00000000-0000-4000-8000-000000000002",
    reviewedAt: "2026-11-02T10:00:00.000Z",
    entries: [{category: "meals", status: "available",
      description: "Lunch available for enrolled students.",
      evidenceReference: "Independent meal contract review", expiresOn: null}],
  },
};

describe("canonical site parent extras", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readApprovedPublicSchoolDay).mockResolvedValue(approvedSchedule as never);
  });

  it("reads reviewed school hours for exactly one approved academic Program", async () => {
    const reader = {} as Parameters<typeof readApprovedPublicParentExtras>[3];
    const result = await readApprovedPublicParentExtras(siteId, ["program-one"], metadata, reader);
    expect(readApprovedPublicSchoolDay).toHaveBeenCalledWith(siteId, "program-one", reader);
    expect(result.schoolDay?.days.value).toEqual([0, 3]);
    expect(result.services.find(item => item.category === "meals")?.description.value)
      .toBe("Lunch available for enrolled students.");
  });

  it("does not promote conflicting multi-Program schedules to a Site-wide claim", async () => {
    for (const programIds of [[], ["program-one", "program-two"]]) {
      const result = await readApprovedPublicParentExtras(siteId, programIds, null);
      expect(result.schoolDay).toBeUndefined();
      expect(result.services.every(item => !item.description.canDisplay)).toBe(true);
    }
    expect(readApprovedPublicSchoolDay).not.toHaveBeenCalled();
  });
});
