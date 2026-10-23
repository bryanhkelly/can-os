import { describe, expect, it } from "vitest";
import { assertSeasonRegistrationOpen, assertLegacyActivityRegistrationAllowed, extendedRegistrationOpeningReadiness, assertVerifiedExtendedSeasonOpening, unavailableExtendedSeasonApprovals, type ExtendedSeasonOpeningEvidence, type RegistrationSeason } from "@/modules/activities/registration-policy";

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

describe("Extended-learning registration readiness", () => {
  const verified: ExtendedSeasonOpeningEvidence = {
    programStatus: "active", seasonStatus: "draft", siteMatchesProgram: true,
    capacity: 20, approvedSafeguardingCoverage: true,
    verifiedOnsiteStaffing: true, emergencyResponsePlanApproved: true,
    pickupAndReleasePolicyApproved: true, datedSessionsAndCoverageVerified: true,
  };
  it("reports missing approvals as blockers instead of trusting a draft season", () => {
    expect(extendedRegistrationOpeningReadiness({
      ...verified, programStatus: "launching", approvedSafeguardingCoverage: false,
      pickupAndReleasePolicyApproved: false,
    })).toMatchObject({ ready: false });
    const { blockers } = extendedRegistrationOpeningReadiness({
      ...verified, approvedSafeguardingCoverage: false,
      pickupAndReleasePolicyApproved: false,
    });
    expect(blockers).toHaveLength(2);
    expect(blockers.join(" ")).toMatch(/safeguarding/);
    expect(blockers.join(" ")).toMatch(/pickup/);
  });
  it("requires matching active program, positive capacity and draft state", () => {
    for (const invalid of [
      { programStatus: "launching" }, { siteMatchesProgram: false },
      { seasonStatus: "registration" }, { capacity: null }, { capacity: 0 },
    ]) expect(extendedRegistrationOpeningReadiness({ ...verified, ...invalid }).ready).toBe(false);
  });
  it("cannot declare ready if any required operational approval is missing", () => {
    for (const key of [
      "approvedSafeguardingCoverage", "verifiedOnsiteStaffing",
      "emergencyResponsePlanApproved", "pickupAndReleasePolicyApproved",
      "datedSessionsAndCoverageVerified",
    ] as const) expect(extendedRegistrationOpeningReadiness({
      ...verified, [key]: false,
    }).ready).toBe(false);
    // A pure fixture is not a verified server approval or an executable publisher.
    expect(extendedRegistrationOpeningReadiness(verified).ready).toBe(true);
  });
});

describe("Server opening gate protects both publishing and guardian registration", () => {
  const base: ExtendedSeasonOpeningEvidence = {
    programStatus: "active", seasonStatus: "draft",
    siteMatchesProgram: true, capacity: 25,
    approvedSafeguardingCoverage: true, verifiedOnsiteStaffing: true,
    emergencyResponsePlanApproved: true, pickupAndReleasePolicyApproved: true,
    datedSessionsAndCoverageVerified: true,
  };
  it("blocks publication when any independently verified approval is absent", () => {
    for (const key of Object.keys(unavailableExtendedSeasonApprovals) as Array<keyof typeof unavailableExtendedSeasonApprovals>) {
      expect(() => assertVerifiedExtendedSeasonOpening({ ...base, [key]: false }, "publish"))
        .toThrow(/registration is blocked/);
    }
    expect(() => assertVerifiedExtendedSeasonOpening({
      ...base, ...unavailableExtendedSeasonApprovals,
    }, "publish")).toThrow(/safeguarding/);
  });
  it("does not grandfather already-published offers or allow malformed status transitions", () => {
    expect(() => assertVerifiedExtendedSeasonOpening({
      ...base, seasonStatus: "registration", ...unavailableExtendedSeasonApprovals,
    }, "register")).toThrow(/registration is blocked/);
    expect(() => assertVerifiedExtendedSeasonOpening({ ...base, seasonStatus: "closed" }, "register"))
      .toThrow(/not open/);
    expect(() => assertVerifiedExtendedSeasonOpening({ ...base, seasonStatus: "registration" }, "publish"))
      .toThrow(/draft/);
  });
  it("keeps an all-approved fixture logically valid without treating it as real clearance", () => {
    expect(() => assertVerifiedExtendedSeasonOpening(base, "publish")).not.toThrow();
    expect(() => assertVerifiedExtendedSeasonOpening({ ...base, seasonStatus: "registration" }, "register")).not.toThrow();
  });
});
