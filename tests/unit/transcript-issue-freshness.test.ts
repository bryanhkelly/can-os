import { describe,expect,it } from "vitest";
import {assertUnchangedTranscriptProjection} from "@/domain/transcript-issue-freshness";
type Row={sectionGradeId:string;sectionId:string;letterGrade:string;gradeUpdatedAt:string|null;creditsEarned:number};
const first:Row={sectionGradeId:"grade-1",sectionId:"math",letterGrade:"A",gradeUpdatedAt:"2026-10-01",creditsEarned:3};
const second:Row={sectionGradeId:"withdrawal:enrollment-2",sectionId:"english",letterGrade:"W",gradeUpdatedAt:null,creditsEarned:0};
const check=(before:Row[],after:Row[])=>
 assertUnchangedTranscriptProjection(before,after);
describe("locked official transcript issuance source projection",()=>{
 it("permits stable evidence with different database row order",()=>{
  expect(()=>check([first,second],[second,first])).not.toThrow();
 });
 it("blocks same-letter correction timestamps even if issued credit is unchanged",()=>{
  expect(()=>check([first],[{...first,gradeUpdatedAt:"2026-10-02"}])).toThrow(/Academic evidence changed/);
 });
 it("blocks changes to grades, credits, W notations and source membership",()=>{
  expect(()=>check([first],[{...first,letterGrade:"B"}])).toThrow(/changed/);
  expect(()=>check([first],[{...first,creditsEarned:2}])).toThrow(/changed/);
  expect(()=>check([first,second],[first,{...second,letterGrade:"A"}])).toThrow(/changed/);
  expect(()=>check([first,second],[first])).toThrow(/changed/);
  expect(()=>check([first],[first,second])).toThrow(/changed/);
 });
 it("rejects missing and duplicate source identifiers rather than silently comparing",()=>{
  expect(()=>check([first,first],[first,first])).toThrow(/Duplicated/);
  expect(()=>check([{...first,sectionGradeId:""}],[first])).toThrow(/missing/);
 });
});
