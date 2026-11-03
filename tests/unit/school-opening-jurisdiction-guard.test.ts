import { describe, expect, it } from "vitest";
import { matchesCurrentOpeningJurisdiction } from "@/domain/school-opening-jurisdiction-guard";

const current = {
  scopeFingerprint:"jurisdiction-scope-v1:abc12345",
  profileVersionId:"current-policy-version",
};

describe("canonical school opening jurisdiction binding", () => {
  it("only accepts the exact independently reviewed site/program and policy revision", () => {
    expect(matchesCurrentOpeningJurisdiction(current,current)).toBe(true);
    expect(matchesCurrentOpeningJurisdiction(null,current)).toBe(false);
    expect(matchesCurrentOpeningJurisdiction(undefined,current)).toBe(false);
    expect(matchesCurrentOpeningJurisdiction({
      ...current,scopeFingerprint:"jurisdiction-scope-v1:changed",
    },current)).toBe(false);
    expect(matchesCurrentOpeningJurisdiction({
      ...current,profileVersionId:"superseded-policy",
    },current)).toBe(false);
  });
  it("rejects unbound legacy approvals and missing stamp fields", () => {
    expect(matchesCurrentOpeningJurisdiction({
      ...current,scopeFingerprint:"",
    },current)).toBe(false);
    expect(matchesCurrentOpeningJurisdiction({
      ...current,profileVersionId:"",
    },current)).toBe(false);
  });
});
