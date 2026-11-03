import { describe, expect, it } from "vitest";
import { addressStateJurisdiction } from "@/domain/site-jurisdiction-default";

const jurisdictions=[
  {id:"tx",name:"Texas",code:"US-TX"},
  {id:"fl",name:"Florida",code:"FL"},
];
describe("school Site address jurisdiction",()=>{
  it("resolves explicit state abbreviations and full state names",()=>{
    expect(addressStateJurisdiction({country:"US",state:"TX"},jurisdictions)).toBe("tx");
    expect(addressStateJurisdiction({country:"US",state:"Florida"},jurisdictions)).toBe("fl");
    expect(addressStateJurisdiction({country:"US",regionCode:"US-TX"},jurisdictions)).toBe("tx");
  });
  it("does not guess a state from a timezone or unknown address",()=>{
    expect(addressStateJurisdiction({timezone:"America/New_York"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({state:"Unknown"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({state:"TX"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({country:"CA",state:"TX"},jurisdictions)).toBeNull();
    expect(addressStateJurisdiction(null,jurisdictions)).toBeNull();
    expect(addressStateJurisdiction({country:"CA",state:"Texas"},jurisdictions)).toBeNull();
  });
});
