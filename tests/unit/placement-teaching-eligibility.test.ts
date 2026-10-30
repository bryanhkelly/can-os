import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { verifiedTeacherSectionIds } from "@/modules/enrollment/verified-section-teachers.server";
import type { TeachingEligibilityReader } from "@/modules/staffing/teaching-eligibility.server";
const state=vi.hoisted(()=>({
  rows:[] as Array<{sectionId:string;personId:string}>,evaluate:vi.fn(),coverage:vi.fn(),select:vi.fn(),
  whereClauses:[] as unknown[],
}));
vi.mock("@/db/client",()=>({db:{}}));
vi.mock("@/modules/staffing/teaching-eligibility.server",()=>({evaluateTeachingEligibility:state.evaluate}));
vi.mock("@/modules/staffing/instructional-coverage.server",()=>({evaluateInstructionalCoverage:state.coverage}));
const executor={
  select:state.select,selectDistinctOn:vi.fn(),
} as unknown as TeachingEligibilityReader;
beforeEach(()=>{
  vi.clearAllMocks();
  state.whereClauses=[];
  state.rows=[{sectionId:"a",personId:"teacher"}];
  state.select.mockImplementation(()=>({
    from(){return this;},innerJoin(){return this;},
    where(predicate:unknown){state.whereClauses.push(predicate);return this;},
    async orderBy(){return state.rows;},
  }));
  state.coverage.mockImplementation(async(sectionId:string)=>{
    const coveredInstructorIds=new Set(
      state.rows.filter(row=>row.sectionId===sectionId).map(row=>row.personId));
    return {covered:coveredInstructorIds.size>0,coveredInstructorIds};
  });
  state.evaluate.mockResolvedValue({eligible:true});
});
describe("placement uses the canonical full-term teacher decision",()=>{
  it("passes the same transaction and requires a current assignment and delivery coverage",async()=>{
    expect(await verifiedTeacherSectionIds(["a","a"],executor)).toEqual(new Set(["a"]));
    expect(state.coverage).toHaveBeenCalledExactlyOnceWith("a",executor);
    expect(state.evaluate).toHaveBeenCalledExactlyOnceWith("a","teacher",executor,{
      horizon:"instructional_window",requireAssignment:true,
    });
  });
  it("reads only teacher-role assignment rows while keeping active-section scoping",async()=>{
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set(["a"]));
    const query=new PgDialect().sqlToQuery(state.whereClauses[0] as SQL);
    expect(query.sql).toContain('"section_teachers"."role"');
    expect(query.sql).toContain('"sections"."active"');
    expect(query.params).toContain("teacher");
    expect(query.params).toContain("a");
  });
  it("does not turn denied qualification/identity decisions into staffed Sections",async()=>{
    state.evaluate.mockResolvedValue({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
  });
  it("blocks a qualified teacher whose delivery arrangement was withdrawn",async()=>{
    state.coverage.mockResolvedValue({covered:false,coveredInstructorIds:new Set()});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).not.toHaveBeenCalled();
  });
  it("verifies a section only when every assigned teacher is eligible",async()=>{
    state.rows=[{sectionId:"a",personId:"primary"},{sectionId:"a",personId:"secondary"}];
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set(["a"]));
    expect(state.evaluate).toHaveBeenCalledTimes(2);
  });
  it("denies a section with an eligible covering primary but an ineligible secondary",async()=>{
    state.rows=[{sectionId:"a",personId:"primary"},{sectionId:"a",personId:"secondary"}];
    state.evaluate.mockResolvedValueOnce({eligible:true}).mockResolvedValueOnce({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).toHaveBeenCalledTimes(2);
  });
  it("does not combine one instructor's coverage with another instructor's eligibility",async()=>{
    state.rows=[{sectionId:"a",personId:"covered"},{sectionId:"a",personId:"qualified"}];
    state.coverage.mockResolvedValue({covered:true,coveredInstructorIds:new Set(["covered"])});
    state.evaluate.mockResolvedValueOnce({eligible:true}).mockResolvedValueOnce({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).toHaveBeenNthCalledWith(1,"a","covered",executor,{
      horizon:"instructional_window",requireAssignment:true,
    });
    expect(state.evaluate).toHaveBeenNthCalledWith(2,"a","qualified",executor,{
      horizon:"instructional_window",requireAssignment:true,
    });
  });
  it("stops evaluating a section's teachers after the first denial",async()=>{
    state.rows=[{sectionId:"a",personId:"unqualified"},{sectionId:"a",personId:"qualified"},
      {sectionId:"a",personId:"unneeded"}];
    state.evaluate.mockResolvedValueOnce({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).toHaveBeenCalledTimes(1);
  });
  it("deduplicates assignment pairs without sharing eligibility across Sections",async()=>{
    state.rows=[{sectionId:"a",personId:"teacher"},{sectionId:"a",personId:"teacher"},
      {sectionId:"b",personId:"teacher"}];
    state.evaluate.mockResolvedValueOnce({eligible:false}).mockResolvedValueOnce({eligible:true});
    expect(await verifiedTeacherSectionIds(["a","b"],executor)).toEqual(new Set(["b"]));
    expect(state.evaluate).toHaveBeenCalledTimes(2);
  });
  it("reevaluates each call so a prior preview cannot bypass later revocation",async()=>{
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set(["a"]));
    state.evaluate.mockResolvedValue({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).toHaveBeenCalledTimes(2);
  });
  it("propagates data/configuration failures rather than reporting a successful empty read",async()=>{
    state.evaluate.mockRejectedValue(new Error("Database unavailable"));
    await expect(verifiedTeacherSectionIds(["a"],executor)).rejects.toThrow("Database unavailable");
  });
  it("does no reads for an empty request or evaluations without assignments",async()=>{
    expect(await verifiedTeacherSectionIds([],executor)).toEqual(new Set());
    expect(state.select).not.toHaveBeenCalled();
    state.rows=[];
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).not.toHaveBeenCalled();
    expect(state.coverage).not.toHaveBeenCalled();
  });
});
