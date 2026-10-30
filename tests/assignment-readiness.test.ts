import {describe,expect,it} from "vitest";
import {assessAssignmentReadiness,validateResponsibilityAssignments} from "../src/domain/assignment-readiness";
const now=new Date("2026-10-15");
describe("multi-school readiness",()=>{
 it("enforces named accountable organization without enum-coded owners",()=>{
  expect(validateResponsibilityAssignments(["instruction","safeguarding"],[{responsibilityKey:"instruction",accountableOrganizationId:"org-12"}],now)).toHaveLength(1);
  expect(validateResponsibilityAssignments(["instruction"],[{responsibilityKey:"instruction",accountableOrganizationId:"org-12"},{responsibilityKey:"instruction",accountableOrganizationId:"org-27"}],now)).toHaveLength(1);
 });
 it("reuses credentials but calculates eligibility for each distinct site assignment",()=>{
  const common={personId:"person-1",policyRuleCode:"CPR",policy:{op:"credential" as const,type:"cpr"},credentials:[{type:"cpr",verified:true}],evidence:[],exemptions:[],asOf:now,assignmentIsActive:true};
  expect(assessAssignmentReadiness({...common,roleAssignmentId:"site-a-role",hasAuthorizedMembership:true}).eligible).toBe(true);
  expect(assessAssignmentReadiness({...common,roleAssignmentId:"site-b-role",hasAuthorizedMembership:false}).eligible).toBe(false);
 });
 it("evaluates approved scoped exemptions without changing the underlying credential",()=>{
  const result=assessAssignmentReadiness({personId:"p",roleAssignmentId:"ra",policyRuleCode:"CPR",policy:{op:"credential",type:"cpr"},credentials:[],evidence:[],asOf:now,assignmentIsActive:true,hasAuthorizedMembership:true,exemptions:[{ruleCode:"CPR",subjectId:"ra",approvedBy:"authorized-verifier",reason:"Documented exemption",validFrom:new Date("2026-01-01"),validThrough:new Date("2027-01-01")}]});
  expect(result).toMatchObject({eligible:true,exempted:true});
 });
});
