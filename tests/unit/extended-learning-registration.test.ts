import { describe, expect, it } from "vitest";
import { assertSeasonRegistrationOpen, assertLegacyActivityRegistrationAllowed, type RegistrationSeason } from "@/modules/activities/registration-policy";

const current: RegistrationSeason = {
  seasonStatus: "registration",
  startsOn: "2026-06-01",
  endsOn: "2026-08-31",
  registrationOpensAt: new Date("2026-04-01T00:00:00Z"),
  registrationClosesAt: new Date("2026-07-01T00:00:00Z"),
};

describe("Extended Learning registration policy", () => {
  it("permits open enrollment", () => {
    expect(() => assertSeasonRegistrationOpen(current, new Date("2026-05-01T00:00:00Z"))).not.toThrow();
  });
  it("rejects early and late registrations", () => {
    expect(() => assertSeasonRegistrationOpen(current, new Date("2026-03-31T23:59:59Z"))).toThrow(/not opened/);
    expect(() => assertSeasonRegistrationOpen(current, new Date("2026-07-01T00:00:01Z"))).toThrow(/closed/);
  });
  it("rejects paused or completed seasons", () => {
    expect(() => assertSeasonRegistrationOpen({ ...current, seasonStatus: "closed" }, new Date("2026-05-01T00:00:00Z"))).toThrow(/not open/);
    expect(() => assertSeasonRegistrationOpen({ ...current, registrationClosesAt: null }, new Date("2026-09-01T00:00:00Z"))).toThrow(/ended/);
  });
  it("supports enrollment without an explicitly configured registration window", () => {
    expect(() => assertSeasonRegistrationOpen({ ...current, registrationOpensAt: null, registrationClosesAt: null }, new Date("2026-05-01T00:00:00Z"))).not.toThrow();
  });
});

describe("Legacy extended-program registration isolation", () => {
  it("requires verified publishing instead of accepting a legacy-open season", () => {
    for (const type of ["summer_enrichment", "summer_program", "after_school_enrichment"]) {
      expect(() => assertLegacyActivityRegistrationAllowed(type)).toThrow(/verified season-opening safeguards/);
    }
  });
  it("preserves existing school co-curricular and standalone activities", () => {
    expect(() => assertLegacyActivityRegistrationAllowed("full_school")).not.toThrow();
    expect(() => assertLegacyActivityRegistrationAllowed(null)).not.toThrow();
  });
});
