import {describe,expect,it} from "vitest";
import {goResponseCounts,unclassifiedGoEntries} from "@/domain/go-response-observation";
describe("Go response observations",()=>{
  it("counts the first rendered preview as both entry and page",()=>{
    expect(goResponseCounts("page",true)).toEqual({linkOpens:1,pageViews:1,redirectResponses:0});
  });
  it("counts preview navigation as a page only, including navigation back home",()=>{
    expect(goResponseCounts("page",false)).toEqual({linkOpens:0,pageViews:1,redirectResponses:0});
  });
  it("counts every successful redirect as an entry and redirect, never a page",()=>{
    const expected={linkOpens:1,pageViews:0,redirectResponses:1};
    expect(goResponseCounts("redirect",true)).toEqual(expected);
    expect(goResponseCounts("redirect",false)).toEqual(expected);
  });
  it("preserves unclassified historical entries rather than fabricating response types",()=>{
    expect(unclassifiedGoEntries(10,4)).toBe(6);
    expect(unclassifiedGoEntries(0,0)).toBe(0);
    expect(unclassifiedGoEntries(3,5)).toBe(0);
  });
});
