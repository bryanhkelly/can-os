import { describe, expect, it } from "vitest";
import { matchesProgramLaunchReplay } from "../../src/domain/program-launch-replay";
const intent = {
  name: "Grace School", type: "church_hosted_academy", hostOrganizationId: "church", siteId: "site",
  jurisdictionId: "jurisdiction", academicProviderOrganizationId: "can", creditIssuingOrganizationId: "can",
  creditMode: "credit_bearing", targetOpeningDate: "2027-08-23",
  gradeRange: { min: "K", max: "5" }, deliveryModel: { onsite: true, onsiteDaysPerWeek: 5 },
};
describe("canonical launch replay comparison", () => {
  it("accepts the identical proposal and equivalent omitted false/null fields", () => {
    expect(matchesProgramLaunchReplay(intent, { ...intent,
      accreditationAuthorityOrganizationId: null,
      deliveryModel: { ...intent.deliveryModel, asynchronous: false, liveOnline: false } })).toBe(true);
  });
  it("does not equate another school, institution or jurisdiction with the original launch", () => {
    for (const change of [{ siteId: "other" }, { hostOrganizationId: "other" },
      { academicProviderOrganizationId: "other" }, { creditIssuingOrganizationId: "other" },
      { jurisdictionId: "other" }, { accreditationAuthorityOrganizationId: "other" }])
      expect(matchesProgramLaunchReplay(intent, { ...intent, ...change })).toBe(false);
  });
  it("rejects a changed target, school model, name or grades", () => {
    for (const change of [{ targetOpeningDate: "2028-08-23" }, { name: "Different School" },
      { type: "hybrid_program" }, { gradeRange: { min: "K", max: "12" } }])
      expect(matchesProgramLaunchReplay(intent, { ...intent, ...change })).toBe(false);
  });
  it("rejects changed instructional commitments", () => {
    for (const deliveryModel of [{ onsite: true, onsiteDaysPerWeek: 2 }, { liveOnline: true },
      { ...intent.deliveryModel, asynchronous: true }])
      expect(matchesProgramLaunchReplay(intent, { ...intent, deliveryModel })).toBe(false);
  });
  it("never replays a credit-bearing launch as noncredit", () => {
    expect(matchesProgramLaunchReplay(intent, { ...intent, creditMode: "non_credit", creditIssuingOrganizationId: null })).toBe(false);
  });
  it("keeps legacy launches without a target replayable without inventing one", () => {
    const legacy = { ...intent, targetOpeningDate: undefined };
    expect(matchesProgramLaunchReplay(legacy, legacy)).toBe(true);
    expect(matchesProgramLaunchReplay(legacy, intent)).toBe(false);
  });
});

