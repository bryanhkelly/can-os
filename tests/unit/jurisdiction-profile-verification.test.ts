import { describe, expect, it } from "vitest";
import { isJurisdictionProfileVerificationEvidenceCurrent,isOfficialJurisdictionSource } from "@/domain/jurisdiction-profile";

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

 it("refuses an arbitrary HTTPS domain without explicit independent official agency attribution",()=>{
  const spoof={...sources[0]!,url:"https://fake-schools.example.com/law"};
  expect(isOfficialJurisdictionSource(spoof)).toBe(false);
  expect(isJurisdictionProfileVerificationEvidenceCurrent({
    ...attestation,sources:[spoof],
  },[spoof])).toBe(false);
  const verified={...spoof,officialAuthorityVerified:true,
    officialAuthorityVerificationNote:
      "Confirmed that this non-government-domain site is the official agency host using an independent source."};
  expect(isOfficialJurisdictionSource(verified)).toBe(true);
  expect(isJurisdictionProfileVerificationEvidenceCurrent({
    ...attestation,sources:[verified],
  },[verified])).toBe(true);
  expect(isJurisdictionProfileVerificationEvidenceCurrent({
    ...attestation,sources:[spoof],
  },[verified])).toBe(false);
 });
 it("rejects credentials, misleading .gov suffixes, invalid dates and absent authority",()=>{
   const source=sources[0]!;
   for(const url of [
     "https://state.example.gov.attacker.com/rules",
     "https://user:password@state.example.gov/rules",
     "http://state.example.gov/rules",
   ])expect(isOfficialJurisdictionSource({...source,url})).toBe(false);
   expect(isOfficialJurisdictionSource({...source,authority:""})).toBe(false);
   expect(isOfficialJurisdictionSource({...source,checkedAt:"invalid-date"})).toBe(false);
 });
 it("requires a substantive recorded reviewer note",()=>{
  expect(isJurisdictionProfileVerificationEvidenceCurrent({
   note:"Checked.",
   sources,
  },sources)).toBe(false);
 });
});
