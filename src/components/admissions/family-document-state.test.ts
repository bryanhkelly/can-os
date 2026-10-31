import {describe,it,expect} from "vitest";
import {familyRequirementKey,isEnrollmentDocumentCandidate} from "./family-document-state";
describe("family document draft isolation",()=>{
 it("does not share sibling application drafts",()=>{
  expect(familyRequirementKey("child-a","medical")).not.toBe(familyRequirementKey("child-b","medical"));
  expect(familyRequirementKey("a:b","c")).not.toBe(familyRequirementKey("a","b:c"));
 });
 it("accepts only bounded PDF and image uploads",()=>{
  expect(isEnrollmentDocumentCandidate({size:100,type:"application/pdf"})).toBe(true);
  expect(isEnrollmentDocumentCandidate({size:10*1024*1024,type:"image/png"})).toBe(true);
  expect(isEnrollmentDocumentCandidate({size:0,type:"image/jpeg"})).toBe(false);
  expect(isEnrollmentDocumentCandidate({size:10*1024*1024+1,type:"application/pdf"})).toBe(false);
  expect(isEnrollmentDocumentCandidate({size:100,type:"text/html"})).toBe(false);
 });
});
