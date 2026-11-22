import { describe, expect, it } from "vitest";
import { assertReportingSourceOwnerMatches } from "@/domain/reporting-source-owner-policy";

const scope={siteId:"siteA",organizationId:"ownerA",programId:null};
describe("canonical reporting source owner validation",()=>{
  it("keeps shared physical room ownership at Site grain",()=>{
    expect(()=>assertReportingSourceOwnerMatches({siteId:"siteA"},scope)).not.toThrow();
    expect(()=>assertReportingSourceOwnerMatches({siteId:"siteB"},scope))
      .toThrow("ownership");
  });
  it("forbids using a sibling Organization's source under a Site",()=>{
    expect(()=>assertReportingSourceOwnerMatches({
      siteId:"siteA",organizationId:"ownerB",
    },scope)).toThrow("ownership");
  });
  it("requires exact Program scope for Program-owned interest registrations",()=>{
    const owner={siteId:"siteA",organizationId:"ownerA",programId:"programA"};
    expect(()=>assertReportingSourceOwnerMatches(owner,{...scope,programId:"programA"}))
      .not.toThrow();
    expect(()=>assertReportingSourceOwnerMatches(owner,{...scope,programId:"programB"}))
      .toThrow("ownership");
    expect(()=>assertReportingSourceOwnerMatches(owner,scope)).toThrow();
  });
  it("denies unavailable canonical records rather than assuming ownership",()=>{
    expect(()=>assertReportingSourceOwnerMatches(null,scope)).toThrow("ownership");
  });
});
