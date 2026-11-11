import { describe, expect, it } from "vitest";
import { suggestedLaunchInstitutions } from "../../src/domain/launch-institution-defaults";
const church = { id: "church", type: "church" };
const can = { id: "can", type: "can_network" };
const base = { type: "church_hosted_academy", creditMode: "credit_bearing" as const,
  providers: [church, can], issuers: [church, can], selectedProviderId: "" };
describe("launch institution suggestions", () => {
  it("suggests the single CAN institution and matching issuer for a CAN academy", () => {
    expect(suggestedLaunchInstitutions(base)).toEqual({ providerId: can.id, issuerId: can.id });
  });
  it("preserves an explicitly chosen own-organization school", () => {
    expect(suggestedLaunchInstitutions({ ...base, selectedProviderId: church.id }))
      .toEqual({ providerId: church.id, issuerId: church.id });
  });
  it("does not guess between multiple CAN institutions", () => {
    expect(suggestedLaunchInstitutions({ ...base,
      providers: [can, { id: "other", type: "can_network" }] }))
      .toEqual({ providerId: undefined, issuerId: undefined });
  });
  it("never supplies a credit issuer for noncredit enrichment", () => {
    expect(suggestedLaunchInstitutions({ ...base, type: "summer_enrichment",
      creditMode: "non_credit", providers: [church] }))
      .toEqual({ providerId: church.id, issuerId: undefined });
  });
  it("does not invent an unavailable matching issuer", () => {
    expect(suggestedLaunchInstitutions({ ...base, issuers: [church] }))
      .toEqual({ providerId: can.id, issuerId: undefined });
  });
  it("leaves other school models with ambiguous institutions for explicit selection", () => {
    expect(suggestedLaunchInstitutions({ ...base, type: "hybrid_program" }))
      .toEqual({ providerId: undefined, issuerId: undefined });
  });
});

