import {describe,it,expect} from "vitest";
import {annualAdoptionEligible,licenseValidForYear} from "./curriculum-year-policy";
const d=(s:string)=>new Date(s);
const year={startsAt:d("2027-08-01"),endsAt:d("2028-06-30")};
const scope={organizationId:"school",programId:"program",siteId:"site",academicProviderOrganizationId:"can",academicYearId:"2027"};
const license={organizationId:"school",packId:"pack",publisherOrganizationId:"publisher",status:"active",startsAt:d("2027-01-01"),endsAt:d("2028-12-31"),withdrawnAt:null};
const adoption={...scope,packId:"pack",packVersionId:"v2",status:"active",supersededAt:null};
const base={scope,license,adoption,year,now:d("2027-09-01"),packVersionPublished:true};
describe("annual adoption policy",()=>{
 it("accepts precisely the licensed year and release",()=>expect(annualAdoptionEligible(base)).toBe(true));
 it("rejects prior-year adoption",()=>expect(annualAdoptionEligible({...base,adoption:{...adoption,academicYearId:"2026"}})).toBe(false));
 it("rejects revoked licenses",()=>expect(annualAdoptionEligible({...base,license:{...license,status:"revoked"}})).toBe(false));
 it("rejects withdrawn licenses",()=>expect(annualAdoptionEligible({...base,license:{...license,withdrawnAt:d("2027-08-02")}})).toBe(false));
 it("rejects missing effective dates",()=>{
  expect(licenseValidForYear({...license,startsAt:null},year,d("2027-09-01"))).toBe(false);
  expect(licenseValidForYear({...license,endsAt:null},year,d("2027-09-01"))).toBe(false);
 });
 it("rejects expired coverage",()=>expect(licenseValidForYear({...license,endsAt:d("2027-12-31")},year,d("2027-09-01"))).toBe(false));
 it("rejects cross-program and cross-provider use",()=>{
  expect(annualAdoptionEligible({...base,scope:{...scope,programId:"other"}})).toBe(false);
  expect(annualAdoptionEligible({...base,scope:{...scope,academicProviderOrganizationId:"other"}})).toBe(false);
 });
 it("rejects superseded or rolled-back adoptions",()=>{
  expect(annualAdoptionEligible({...base,adoption:{...adoption,status:"rolled_back"}})).toBe(false);
  expect(annualAdoptionEligible({...base,adoption:{...adoption,supersededAt:d("2027-08-04")}})).toBe(false);
 });
 it("allows version upgrade only when pinned to chosen release",()=>{
  expect(annualAdoptionEligible({...base,adoption:{...adoption,packVersionId:"v3"}})).toBe(true);
  expect(annualAdoptionEligible({...base,packVersionPublished:false})).toBe(false);
 });
});
