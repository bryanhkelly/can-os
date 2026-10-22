import { describe, expect, it } from "vitest";
import { isExtendedLearningType, resolveProgramCreditMode, programTypes } from "@/domain/program-offerings";
const issuerId = "00000000-0000-4000-8000-000000000001";

describe("Program offerings and credit authority", () => {
  it("includes summer school, camps and after-school enrichment", () => {
    expect(programTypes).toContain("summer_program");
    expect(programTypes).toContain("summer_enrichment");
    expect(programTypes).toContain("after_school_enrichment");
    expect(isExtendedLearningType("high_school_extension")).toBe(false);
  });
  it("allows noncredit summer and after-school programs without fabricated issuers", () => {
    for (const type of ["summer_program", "summer_enrichment", "after_school_enrichment"] as const)
      expect(resolveProgramCreditMode({type})).toBe("non_credit");
  });
  it("requires issuers for credit-bearing instruction", () => {
    expect(() => resolveProgramCreditMode({type:"high_school_extension"})).toThrow(/require a credit-issuing/);
    expect(() => resolveProgramCreditMode({type:"summer_program",creditMode:"credit_bearing"})).toThrow(/require a credit-issuing/);
    expect(resolveProgramCreditMode({type:"summer_program",creditMode:"credit_bearing",creditIssuingOrganizationId:issuerId})).toBe("credit_bearing");
    expect(resolveProgramCreditMode({type:"full_school",creditIssuingOrganizationId:issuerId})).toBe("credit_bearing");
  });
  it("rejects contradictory credit intent", () => {
    expect(() => resolveProgramCreditMode({type:"after_school_enrichment",creditIssuingOrganizationId:issuerId})).toThrow(/must not designate/);
    expect(() => resolveProgramCreditMode({type:"summer_enrichment",creditMode:"credit_bearing",creditIssuingOrganizationId:issuerId})).toThrow(/Summer academic/);
    expect(() => resolveProgramCreditMode({type:"high_school_extension",creditMode:"non_credit"})).toThrow(/School-year/);
  });
});
