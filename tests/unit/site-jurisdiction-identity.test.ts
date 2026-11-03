import {describe,expect,it} from "vitest";
import {evaluateSiteJurisdictionIdentity} from "@/domain/site-jurisdiction-identity";

const address={
  street1:"123 Church Street",city:"Oakland",state:"CA",postalCode:"94612",
  country:"US",county:"Alameda",
};
const jurisdiction={code:"US-CA",countryCode:"US"};

describe("verified canonical Site jurisdiction location inputs",()=>{
  it("matches saved S address keys, not timezone or other inferred evidence",()=>{
    expect(evaluateSiteJurisdictionIdentity(address,jurisdiction)).toEqual({
      status:"matched_location_facts",reason:null,state:"CA",county:"Alameda",
    });
  });
  it("requires review on an absent, partial or incomplete physical address",()=>{
    expect(evaluateSiteJurisdictionIdentity(null,jurisdiction).status).toBe("review_required");
    for(const key of ["street1","city","postalCode"] as const){
      const missing={...address,[key]:""};
      expect(evaluateSiteJurisdictionIdentity(missing,jurisdiction).status)
        .toBe("review_required");
    }
    expect(evaluateSiteJurisdictionIdentity({...address,state:""},jurisdiction).status)
      .toBe("review_required");
  });
  it("denies country mismatch, unknown state or assigned jurisdiction mismatch",()=>{
    for(const country of ["", "CA", "GB", "United States"]){
      expect(evaluateSiteJurisdictionIdentity({...address,country},jurisdiction).status)
        .toBe("review_required");
    }
    expect(evaluateSiteJurisdictionIdentity(address,{...jurisdiction,countryCode:"CA"}).status)
      .toBe("review_required");
    expect(evaluateSiteJurisdictionIdentity({...address,state:"NY"},jurisdiction).status)
      .toBe("review_required");
    expect(evaluateSiteJurisdictionIdentity({...address,state:"California"},jurisdiction).status)
      .toBe("review_required");
    expect(evaluateSiteJurisdictionIdentity(address,{...jurisdiction,code:"US-XX"}).status)
      .toBe("review_required");
  });
  it("does not infer an unknown county or misstate local applicability",()=>{
    expect(evaluateSiteJurisdictionIdentity({...address,county:""},jurisdiction)).toMatchObject({
      status:"matched_location_facts",county:null,
    });
  });
  it("requires explicit US postal formatting rather than trusting an arbitrary free text field",()=>{
    expect(evaluateSiteJurisdictionIdentity({...address,postalCode:"94612-1234"},jurisdiction).status)
      .toBe("matched_location_facts");
    expect(evaluateSiteJurisdictionIdentity({...address,postalCode:"zip unknown"},jurisdiction).status)
      .toBe("review_required");
  });
});
