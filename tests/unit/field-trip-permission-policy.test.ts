import { describe, expect, it } from "vitest";
import {
  publishedTripPermission,
  tripScheduleIsCurrent,
  tripScheduleIsProposable,
} from "@/modules/field-trips/permission-policy";

const NOW = new Date("2026-10-18T12:00:00.000Z");
const future = (days: number) =>
  new Date(NOW.getTime() + days * 24 * 60 * 60 * 1000);
const past = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("publishedTripPermission", () => {
  const validText =
    "I authorize my student to attend this trip and accept the school terms.";

  it("accepts a versioned statement within length bounds", () => {
    expect(
      publishedTripPermission({
        permissionVersion: "2026.1",
        permissionText: validText,
      }),
    ).toEqual({ version: "2026.1", text: validText });
  });

  it("rejects missing metadata, bad versions, and short text", () => {
    expect(publishedTripPermission(null)).toBeNull();
    expect(publishedTripPermission({})).toBeNull();
    expect(
      publishedTripPermission({
        permissionVersion: "bad version!",
        permissionText: validText,
      }),
    ).toBeNull();
    expect(
      publishedTripPermission({
        permissionVersion: "2026.1",
        permissionText: "too short",
      }),
    ).toBeNull();
  });
});

describe("tripScheduleIsProposable", () => {
  it("accepts a future, correctly ordered schedule", () => {
    expect(
      tripScheduleIsProposable(
        { departsAt: future(10), returnsAt: future(11), permissionDueAt: future(5) },
        NOW,
      ),
    ).toBe(true);
  });

  it("accepts a missing permission deadline", () => {
    expect(
      tripScheduleIsProposable(
        { departsAt: future(10), returnsAt: future(11), permissionDueAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects departure in the past", () => {
    expect(
      tripScheduleIsProposable(
        { departsAt: past(1), returnsAt: future(1), permissionDueAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects return at or before departure", () => {
    expect(
      tripScheduleIsProposable(
        { departsAt: future(10), returnsAt: future(10), permissionDueAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a deadline after departure or in the past", () => {
    expect(
      tripScheduleIsProposable(
        { departsAt: future(10), returnsAt: future(11), permissionDueAt: future(12) },
        NOW,
      ),
    ).toBe(false);
    expect(
      tripScheduleIsProposable(
        { departsAt: future(10), returnsAt: future(11), permissionDueAt: past(1) },
        NOW,
      ),
    ).toBe(false);
  });
});

describe("tripScheduleIsCurrent", () => {
  it("accepts a future trip whose deadline has not passed", () => {
    expect(
      tripScheduleIsCurrent(
        { departsAt: future(10), permissionDueAt: future(5) },
        NOW,
      ),
    ).toBe(true);
    expect(
      tripScheduleIsCurrent({ departsAt: future(10), permissionDueAt: null }, NOW),
    ).toBe(true);
  });

  it("rejects a trip that has departed or whose deadline passed", () => {
    expect(
      tripScheduleIsCurrent({ departsAt: past(1), permissionDueAt: null }, NOW),
    ).toBe(false);
    expect(
      tripScheduleIsCurrent(
        { departsAt: future(10), permissionDueAt: past(1) },
        NOW,
      ),
    ).toBe(false);
  });
});
