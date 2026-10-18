import { describe, expect, it } from "vitest";
import { conferenceWindowProblem } from "@/modules/conferences/eligibility";

const now = new Date("2027-11-01T12:00:00.000Z");

describe("conferenceWindowProblem", () => {
  it("accepts a future slot in a published series", () => {
    expect(
      conferenceWindowProblem({
        seriesStatus: "published",
        startsAt: new Date("2027-11-10T22:00:00.000Z"),
        now,
      }),
    ).toBeNull();
  });

  it("rejects a slot whose series is not published", () => {
    expect(
      conferenceWindowProblem({
        seriesStatus: "draft",
        startsAt: new Date("2027-11-10T22:00:00.000Z"),
        now,
      }),
    ).toBe("series_not_published");
    expect(
      conferenceWindowProblem({
        seriesStatus: "archived",
        startsAt: new Date("2027-11-10T22:00:00.000Z"),
        now,
      }),
    ).toBe("series_not_published");
  });

  it("rejects a past or current slot even when published", () => {
    expect(
      conferenceWindowProblem({
        seriesStatus: "published",
        startsAt: new Date("2027-10-31T22:00:00.000Z"),
        now,
      }),
    ).toBe("slot_in_past");
    expect(
      conferenceWindowProblem({ seriesStatus: "published", startsAt: now, now }),
    ).toBe("slot_in_past");
  });

  it("reports the unpublished series before the past-slot problem", () => {
    expect(
      conferenceWindowProblem({
        seriesStatus: "draft",
        startsAt: new Date("2027-10-31T22:00:00.000Z"),
        now,
      }),
    ).toBe("series_not_published");
  });
});
