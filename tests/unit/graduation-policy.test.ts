import {describe,it,expect} from "vitest";
import {resolveGraduationPolicy} from "@/domain/graduation-policy";
const policy=(id:string,start:string,end:string,supersedesRequirementSetId:string|null=null)=>({id,academicYear:"2026",cohortStart:start,cohortEnd:end,supersedesRequirementSetId});
describe("institutional graduation policy applicability",()=>{
 it("resolves old and new entry cohorts regardless of current academic year",()=>{
  const policies=[policy("old","2022","2024"),policy("new","2025","2028")];
  expect(resolveGraduationPolicy(policies,"2023").id).toBe("old");
  expect(resolveGraduationPolicy(policies,"2027").id).toBe("new");
 });
 it("honors a documented transfer entry cohort rather than active enrollment year",()=>{
  expect(resolveGraduationPolicy([policy("transfer","2024","2024")],"2024").id).toBe("transfer");
 });
 it("revisions supersede prior policies deterministically",()=>{
  expect(resolveGraduationPolicy([policy("v1","2024","2024"),policy("v2","2024","2024","v1")],"2024").id).toBe("v2");
 });
 it("rejects competing policies, multiple active years and missing applicability",()=>{
  expect(()=>resolveGraduationPolicy([policy("a","2024","2026"),policy("b","2025","2027")],"2025")).toThrow(/unambiguous/);
  expect(()=>resolveGraduationPolicy([policy("a","2024","2024")],"2026")).toThrow(/unambiguous/);
 });
 it("fails closed for incomplete supersession lineage",()=>{
  expect(()=>resolveGraduationPolicy([policy("v2","2024","2024","missing")],"2024")).toThrow(/incomplete/);
 });
 it("rejects malformed cohort evidence and duplicate identities",()=>{
  expect(()=>resolveGraduationPolicy([policy("a","2024","2024")],"unknown")).toThrow(/cohort/);
  expect(()=>resolveGraduationPolicy([policy("a","2024","2024"),policy("a","2024","2024")],"2024")).toThrow(/Duplicate/);
 });
});
