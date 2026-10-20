import { describe, expect, it } from "vitest";
import { evaluateQualificationCoverage, instructionalWindow, type CoveragePolicy } from "@/modules/staffing/qualification-coverage";

const from = new Date("2030-01-01T00:00:00Z");
const through = new Date("2030-07-01T00:00:00Z");
const window = { from, through };
const policy: CoveragePolicy = {
  ...window, id: "rule", code: "license", expression: { op: "credential", type: "license" }, evidencePolicy: {},
};
const evidence = [{ type: "license", verified: true, validFrom: from, expiresAt: through }];

describe("instructional qualification coverage", () => {
  it("blocks absent, draft-filtered, empty and unknown policies", () => {
    expect(evaluateQualificationCoverage(window, [], evidence).eligible).toBe(false);
    for (const expression of [{}, { op: "all", rules: [] }, { op: "unknown" },
      { op: "atLeast", count: 2, rules: [{ op: "credential", type: "license" }] }]) {
      expect(evaluateQualificationCoverage(window, [{ ...policy, expression }], evidence).eligible).toBe(false);
    }
    expect(evaluateQualificationCoverage(window, [{ ...policy, evidencePolicy: { op: "unknown" } }], evidence).eligible).toBe(false);
  });
  it("requires the exact configured qualification, independent verification and valid bounds", () => {
    expect(evaluateQualificationCoverage(window, [policy], evidence).eligible).toBe(true);
    expect(evaluateQualificationCoverage(window, [policy], [{ type: "unrelated", verified: true }]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [{ ...evidence[0]!, verified: false }]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [{ ...evidence[0]!, revoked: true }]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [{ ...evidence[0]!, validFrom: new Date(from.getTime() + 1) }]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [{ ...evidence[0]!, expiresAt: new Date(through.getTime() - 1) }]).eligible).toBe(false);
  });
  it("finds gaps and changing requirements in the middle, not just at endpoints", () => {
    const middle = new Date("2030-03-01");
    const later = new Date("2030-04-01");
    expect(evaluateQualificationCoverage(window, [
      { ...policy, through: middle }, { ...policy, from: later },
    ], evidence).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [
      policy, { ...policy, from: middle, through: later, expression: { op: "credential", type: "extra" } },
    ], evidence).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [
      { ...evidence[0]!, expiresAt: middle }, { ...evidence[0]!, validFrom: later },
    ]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [policy], [
      { ...evidence[0]!, expiresAt: middle }, { ...evidence[0]!, validFrom: middle },
    ]).eligible).toBe(true);
  });
  it("supports composed alternatives and jurisdiction/issuer criteria", () => {
    expect(evaluateQualificationCoverage(window, [{ ...policy, expression: {
      op: "any", rules: [{ op: "credential", type: "degree" },
        { op: "credential", type: "license", issuer: "Board", jurisdiction: "TEST" }],
    } }], [{ ...evidence[0]!, issuer: "Board", jurisdiction: "TEST" }]).eligible).toBe(true);
    expect(evaluateQualificationCoverage(window, [{ ...policy, expression: {
      op: "credential", type: "license", jurisdiction: "OTHER",
    } }], [{ ...evidence[0]!, jurisdiction: "TEST" }]).eligible).toBe(false);
  });
  it("switches versions at the exact exclusive/inclusive boundary without rewriting earlier requirements", () => {
    const boundary = new Date("2030-04-01T00:00:00Z");
    const versions = [
      { ...policy, id: "previous", through: boundary },
      { ...policy, id: "successor", from: boundary, expression: { op: "credential", type: "safety" } },
    ];
    const credentials = [
      { ...evidence[0]!, expiresAt: boundary },
      { type: "safety", verified: true, validFrom: boundary, expiresAt: through },
    ];
    expect(evaluateQualificationCoverage(window, versions, credentials))
      .toEqual({ eligible: true, reasons: [], policyRuleIds: ["previous", "successor"] });
    expect(evaluateQualificationCoverage(window, versions, [
      credentials[0]!, { ...credentials[1]!, validFrom: new Date(boundary.getTime() + 1) },
    ]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, versions, [
      { ...credentials[0]!, expiresAt: new Date(boundary.getTime() - 1) }, credentials[1]!,
    ]).eligible).toBe(false);
    expect(evaluateQualificationCoverage(window, [
      ...versions, { ...policy, id: "external", expression: { op: "credential", type: "external" } },
    ], credentials).eligible).toBe(false);
  });
  it("uses inclusive term end dates in the school-year timezone across DST", () => {
    const actual = instructionalWindow({ startsAt: null, endsAt: null,
      startsOn: "2030-03-09", endsOn: "2030-03-10", timezone: "America/Los_Angeles" });
    expect(actual.from.toISOString()).toBe("2030-03-09T08:00:00.000Z");
    expect(actual.through.toISOString()).toBe("2030-03-11T07:00:00.000Z");
    expect(instructionalWindow({ startsAt: from, endsAt: through,
      startsOn: "2030-03-09", endsOn: "2030-03-10", timezone: "America/Los_Angeles" })).toEqual(window);
  });
  it("rejects inverted or empty explicit instructional windows", () => {
    expect(() => instructionalWindow({ startsAt: through, endsAt: from,
      startsOn: "2030-01-01", endsOn: "2030-07-01", timezone: "UTC" })).toThrow("coverage window");
    expect(() => evaluateQualificationCoverage({ from, through: from }, [policy], evidence)).toThrow("coverage window");
  });
});
