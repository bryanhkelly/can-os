import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifiedTeacherSectionIds } from "@/modules/enrollment/verified-section-teachers.server";
import type { TeachingEligibilityReader } from "@/modules/staffing/teaching-eligibility.server";
const state=vi.hoisted(()=>({
  rows:[] as Array<{sectionId:string;personId:string}>,evaluate:vi.fn(),coverage:vi.fn(),select:vi.fn(),
}));
vi.mock("@/db/client",()=>({db:{}}));
vi.mock("@/modules/staffing/teaching-eligibility.server",()=>({evaluateTeachingEligibility:state.evaluate}));
vi.mock("@/modules/staffing/instructional-coverage.server",()=>({evaluateInstructionalCoverage:state.coverage}));
const executor={
  select:state.select,selectDistinctOn:vi.fn(),
} as unknown as TeachingEligibilityReader;
beforeEach(()=>{
  vi.clearAllMocks();
  state.rows=[{sectionId:"a",personId:"teacher"}];
  state.select.mockImplementation(()=>({
    from(){return this;},innerJoin(){return this;},where(){return this;},
    async orderBy(){return state.rows;},
  }));
  state.coverage.mockImplementation(async(sectionId:string)=>({
    coveredInstructorIds:new Set(state.rows.filter(row=>row.sectionId===sectionId).map(row=>row.personId)),
  }));
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
  it("does not turn denied qualification/identity decisions into staffed Sections",async()=>{
    state.evaluate.mockResolvedValue({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
  });
  it("blocks a qualified teacher whose delivery arrangement was withdrawn",async()=>{
    state.coverage.mockResolvedValue({coveredInstructorIds:new Set()});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).not.toHaveBeenCalled();
  });
  it("does not combine one instructor's coverage with another instructor's eligibility",async()=>{
    state.rows=[{sectionId:"a",personId:"covered"},{sectionId:"a",personId:"qualified"}];
    state.coverage.mockResolvedValue({coveredInstructorIds:new Set(["covered"])});
    state.evaluate.mockResolvedValueOnce({eligible:false});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set());
    expect(state.evaluate).toHaveBeenCalledExactlyOnceWith("a","covered",executor,{
      horizon:"instructional_window",requireAssignment:true,
    });
  });
  it("tries another covered teacher after denial and stops after a qualified one",async()=>{
    state.rows=[{sectionId:"a",personId:"unqualified"},{sectionId:"a",personId:"qualified"},
      {sectionId:"a",personId:"unneeded"}];
    state.evaluate.mockResolvedValueOnce({eligible:false}).mockResolvedValueOnce({eligible:true});
    expect(await verifiedTeacherSectionIds(["a"],executor)).toEqual(new Set(["a"]));
    expect(state.evaluate).toHaveBeenCalledTimes(2);
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
