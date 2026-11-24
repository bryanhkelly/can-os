import {describe,it,expect} from "vitest";
import {projectHistoricalAcademicPage} from "@/domain/historical-academic-evidence";
describe("historical academic projection",()=>{
 it("redacts raw metadata and unreturned feedback",()=>{
  const page=projectHistoricalAcademicPage([{id:"a",record_kind:"submission",source_record:{status:"submitted",response:{text:"answer"},feedback:{comment:"private"},score:8,grader_person_id:"private",attempt_number:2}}]);
  expect(page.items[0]).toMatchObject({response:"answer",feedback:null,score:null,attempt:2});
  expect(page.items[0]).not.toHaveProperty("grader_person_id");
 });
 it("preserves returned feedback and zero score without inventing timestamps",()=>{
  const page=projectHistoricalAcademicPage([{id:"b",record_kind:"submission",source_record:{status:"returned",feedback:{comment:"revise"},score:0}}]);
  expect(page.items[0]).toMatchObject({feedback:"revise",score:"0",submittedAt:null});
 });
 it("never returns student response text to guardians",()=>{
  const page=projectHistoricalAcademicPage([{id:"g",record_kind:"submission",source_record:{status:"graded",response:{text:"private answer"},feedback:{comment:"released"},score:3}}],"guardian");
  expect(page.items[0]).toMatchObject({response:null,feedback:"released",score:"3"});
 });
 it("bounds pages and keeps the original grade separate",()=>{
  const page=projectHistoricalAcademicPage(Array.from({length:21},(_,i)=>({id:String(i),record_kind:"section_grade",source_record:{status:"finalized",letter_grade:"B"}})));
  expect(page.items).toHaveLength(20);expect(page.nextBefore).toBe("19");
  expect(page.items[0]).toMatchObject({kind:"section_grade",letterGrade:"B",score:null});
 });
});
