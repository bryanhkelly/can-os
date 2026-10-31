import {describe,expect,it} from "vitest";
import {schoolYearStructure} from "../../src/domain/school-year-structure";

describe("school-year planning structure",()=>{
 it("keeps a full-year term within the reviewed dates",()=>{
  expect(schoolYearStructure("2027-08-15","2028-06-10","full_year")).toEqual([
   {key:"full-year",name:"Full-year term",sequence:1,startsOn:"2027-08-15",endsOn:"2028-06-10"},
  ]);
 });
 it("covers every day once across leap-year semesters",()=>{
  const result=schoolYearStructure("2028-02-28","2028-03-02","semesters");
  expect(result.map(t=>[t.startsOn,t.endsOn])).toEqual([
   ["2028-02-28","2028-02-29"],["2028-03-01","2028-03-02"],
  ]);
 });
 it("keeps January openings in their actual date range",()=>{
  expect(schoolYearStructure("2027-01-05","2027-06-10","semesters")[0]!.startsOn).toBe("2027-01-05");
 });
 it.each([["2027-02-29","2027-06-10"],["2027-06-10","2027-01-05"]])("rejects invalid ranges",(start,end)=>{
  expect(()=>schoolYearStructure(start,end,"full_year")).toThrow("valid school-year date range");
 });
 it("does not suggest two semesters for a single day",()=>{
  expect(()=>schoolYearStructure("2027-06-10","2027-06-10","semesters")).toThrow("at least two");
 });
});
