import {describe,expect,it} from "vitest";
import {verifiedSectionCreditUnits,requireKnownTranscriptCredits} from "@/domain/section-credit-policy";

describe("official academic credit safeguards",()=>{
  it("never fabricates a one-credit course when metadata is absent",()=>{
    expect(verifiedSectionCreditUnits({})).toBeNull();
    expect(verifiedSectionCreditUnits({credits:"1"})).toBeNull();
    expect(verifiedSectionCreditUnits({credits:1})).toBe(1);
    expect(verifiedSectionCreditUnits({credits:0.5})).toBe(0.5);
    expect(verifiedSectionCreditUnits({credits:0.25})).toBe(0.25);
    for(const x of [0,-1,Infinity,NaN,11,0.123]){
      expect(verifiedSectionCreditUnits({credits:x})).toBeNull();
    }
  });
  it("prevents issuing an official transcript without a configured credit decision",()=>{
    const okay={creditConfigured:true,creditsAttempted:1,creditsEarned:1};
    expect(()=>requireKnownTranscriptCredits([okay])).not.toThrow();
    expect(()=>requireKnownTranscriptCredits([{...okay,creditConfigured:false}])).toThrow("explicitly configured");
    expect(()=>requireKnownTranscriptCredits([{...okay,creditsAttempted:null}])).toThrow("explicitly configured");
    expect(()=>requireKnownTranscriptCredits([{...okay,creditsEarned:null}])).toThrow("explicitly configured");
  });
});
