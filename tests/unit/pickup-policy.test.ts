import { describe, expect, it } from "vitest";
import { evaluatePickupRelease, normalizedLegalName } from "@/domain/pickup-policy";

const valid = {
  attendanceStatus: "present",
  alreadyReleased: false,
  authorization: {
    status: "active",
    startsOn: "2026-10-01",
    expiresOn: "2026-10-31",
    identityVerificationMethod: "government_photo_id",
    expectedLegalName: "Morgan Authorized Adult",
  },
  activeHoldKinds: [],
  date: "2026-10-28",
  identityVerified: true,
  identityVerificationMethod: "government_photo_id",
  verifiedLegalName: "  morgan   authorized adult ",
  handoffEvidence: "Matched photo ID and witnessed the child leave with the adult.",
} as const;

describe("verified pickup release policy", () => {
  it("requires attendance, current family authority, matching identity and handoff evidence", () => {
    expect(evaluatePickupRelease(valid)).toEqual({ allowed: true });
    expect(normalizedLegalName(valid.verifiedLegalName)).toBe("morgan authorized adult");
  });

  it.each([
    [{ attendanceStatus: "absent" }, "not_present"],
    [{ attendanceStatus: "unmarked" }, "not_present"],
    [{ alreadyReleased: true }, "already_released"],
    [{ authorization: null }, "not_authorized"],
    [{ authorization: { ...valid.authorization, status: "revoked" } }, "not_authorized"],
    [{ authorization: { ...valid.authorization, startsOn: "2026-10-29" } }, "not_authorized"],
    [{ authorization: { ...valid.authorization, expiresOn: "2026-10-27" } }, "expired_authorization"],
    [{ activeHoldKinds: ["disputed_custody"] }, "custody_dispute"],
    [{ activeHoldKinds: ["emergency"] }, "emergency_hold"],
    [{ identityVerified: false }, "identity_not_verified"],
    [{ verifiedLegalName: "Different Person" }, "identity_not_verified"],
    [{ identityVerificationMethod: "school_issued_id" }, "identity_not_verified"],
    [{ handoffEvidence: "short" }, "handoff_evidence_required"],
  ] as const)("denies unsafe release case %#", (override, reason) => {
    expect(evaluatePickupRelease({ ...valid, ...override })).toEqual({ allowed: false, reason });
  });

  it("does not let a tardy mark substitute for any other release gate", () => {
    expect(evaluatePickupRelease({ ...valid, attendanceStatus: "tardy" })).toEqual({ allowed: true });
    expect(evaluatePickupRelease({
      ...valid,
      attendanceStatus: "tardy",
      activeHoldKinds: ["emergency"],
    })).toEqual({ allowed: false, reason: "emergency_hold" });
  });
});
