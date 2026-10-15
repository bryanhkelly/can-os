import {describe,expect,it} from "vitest";
import {parseQualificationPolicy,parseEvidencePolicy} from "../src/modules/profiles/policy-validation";
describe("authored compliance policy ingestion",()=>{
 it("accepts valid configurable rules",()=>expect(parseQualificationPolicy({op:"any",rules:[{op:"credential",type:"safety.cpr"},{op:"credential",type:"safety.bls"}]}).op).toBe("any"));
 it("rejects unknown operations, empty trees, and oversized thresholds",()=>{
  expect(()=>parseQualificationPolicy({op:"execute",code:"anything"})).toThrow();
  expect(()=>parseQualificationPolicy({op:"all",rules:[]})).toThrow();
  expect(()=>parseQualificationPolicy({op:"atLeast",count:5,rules:[{op:"credential",type:"cpr"}]})).toThrow();
 });
 it("validates evidence criteria",()=>{
  expect(parseEvidencePolicy({op:"evidence",type:"accreditation.document"})).toEqual({op:"evidence",type:"accreditation.document"});
  expect(()=>parseEvidencePolicy({op:"all",rules:[]})).toThrow();
 });
});
