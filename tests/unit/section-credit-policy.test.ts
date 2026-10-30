import {describe,expect,it} from "vitest";
import {
  verifiedSectionCreditUnits,
  countTranscriptRowsWithUnrecordedCredits,
} from "@/domain/section-credit-policy";

describe("transcripts record academic facts without deciding graduation",()=>{
  it("never invents one credit where course units have not been configured",()=>{
    expect(verifiedSectionCreditUnits({})).toBeNull();
    expect(verifiedSectionCreditUnits({credits:"1"})).toBeNull();
    expect(verifiedSectionCreditUnits({credits:1})).toBe(1);
    expect(verifiedSectionCreditUnits({credits:0.5})).toBe(0.5);
    expect(verifiedSectionCreditUnits({credits:0.25})).toBe(0.25);
    expect(verifiedSectionCreditUnits({credits:0.29})).toBe(0.29);
    for(const x of [0,-1,Infinity,NaN,11,0.123]){
      expect(verifiedSectionCreditUnits({credits:x})).toBeNull();
    }
  });
  it("discloses unknown credits without rejecting valid academic transcript rows",()=>{
    const known={creditConfigured:true,creditsAttempted:1,creditsEarned:1};
    const missing={creditConfigured:false,creditsAttempted:null,creditsEarned:null};
    const failed={creditConfigured:true,creditsAttempted:0.5,creditsEarned:0};
    const nonTerminal={creditConfigured:true,creditsAttempted:0,creditsEarned:0};
    expect(countTranscriptRowsWithUnrecordedCredits([known,missing,failed,nonTerminal])).toBe(1);
    expect(countTranscriptRowsWithUnrecordedCredits([known,failed])).toBe(0);
    expect(countTranscriptRowsWithUnrecordedCredits([missing,missing])).toBe(2);
    expect(countTranscriptRowsWithUnrecordedCredits([])).toBe(0);
  });
  it("does not inflate missing-credit counts with earlier grading periods",()=>{
    expect(countTranscriptRowsWithUnrecordedCredits([
      {terminalPeriod:false,creditConfigured:false,creditsAttempted:0,creditsEarned:0},
      {terminalPeriod:false,creditConfigured:false,creditsAttempted:null,creditsEarned:null},
      {terminalPeriod:true,creditConfigured:false,creditsAttempted:null,creditsEarned:null},
    ])).toBe(1);
  });
  it("treats absent credit fields as unknown, not as proof of zero credits",()=>{
    expect(countTranscriptRowsWithUnrecordedCredits([
      {creditConfigured:true,creditsAttempted:null,creditsEarned:null},
      {creditConfigured:true,creditsAttempted:0,creditsEarned:0},
      {},
    ])).toBe(2);
  });
});
