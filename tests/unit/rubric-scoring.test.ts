import { describe, it, expect } from "vitest";
import { readRubric, scoreRubric, sampleRubric } from "@/modules/student-experience/rubric";
describe("criterion rubric scoring",()=>{
 it("totals correctly with partial credit",()=>expect(scoreRubric(sampleRubric,[
  {id:"thesis",points:24},{id:"evidence",points:32},{id:"clarity",points:27}
 ])).toEqual({earned:83,possible:100,percentage:83}));
 it("refuses out-of-range grades",()=>expect(()=>scoreRubric(sampleRubric,[
  {id:"thesis",points:31},{id:"evidence",points:35},{id:"clarity",points:30}
 ])).toThrow());
 it("refuses missing criteria",()=>expect(()=>scoreRubric(sampleRubric,[
  {id:"thesis",points:20},{id:"evidence",points:30}
 ])).toThrow());
 it("filters malformed criteria",()=>expect(readRubric([sampleRubric[0],{id:"bad",label:"Bad",maxPoints:-2}])).toHaveLength(1));
});
