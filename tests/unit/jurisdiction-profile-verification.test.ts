import { describe, expect, it } from "vitest";
import { isJurisdictionProfileVerificationEvidenceCurrent } from "@/domain/jurisdiction-profile";

const sources=[{
 title:"State education code",
 url:"https://state.example.gov/education",
 authority:"State Department of Education",
 checkedAt:"2026-10-31T12:00:00.000Z",
}];
const attestation={
 note:"Reviewed the official code and confirmed that the current summary matches it.",
 sources,
};

describe("jurisdiction profile verification evidence",()=>{
 it("accepts reviewer evidence tied to the exact current official sources",()=>{
  expect(isJurisdictionProfileVerificationEvidenceCurrent(attestation,sources)).toBe(true);
 });

 it("invalidates verification when any current source changes",()=>{
  expect(isJurisdictionProfileVerificationEvidenceCurrent(attestation,[{
   ...sources[0],checkedAt:"2026-11-01T12:00:00.000Z",
  }])).toBe(false);
  expect(isJurisdictionProfileVerificationEvidenceCurrent(attestation,[])).toBe(false);
 });

 it("requires a substantive recorded reviewer note",()=>{
  expect(isJurisdictionProfileVerificationEvidenceCurrent({
   note:"Checked.",
   sources,
  },sources)).toBe(false);
 });
});
