import { describe,expect,it } from "vitest";
import { projectSubmissionRevisionPage } from "@/domain/submission-revisions";
const row=(revision_no:number,response:unknown={})=>({revision_no,status:"returned",response,submitted_at:null,recorded_at:"2026-11-24T00:00:00Z",source:"baseline"});
describe("submission revision projection",()=>{
 it("bounds pages and preserves the next cursor",()=>{
   const result=projectSubmissionRevisionPage(Array.from({length:21},(_,i)=>row(25-i)));
   expect(result.items).toHaveLength(20);
   expect(result.nextBefore).toBe(6);
 });
 it("preserves unknown original timestamps and does not expose raw metadata",()=>{
   const result=projectSubmissionRevisionPage([row(1,{text:"answer",teacherFeedback:"private",practiceScore:7,hidden:"internal"})]);
   expect(result.items[0]).toMatchObject({submittedAt:null,source:"baseline",responseText:"answer",practiceFeedback:null,practiceScore:null});
   expect(result.items[0]).not.toHaveProperty("hidden");
   expect(result.nextBefore).toBeNull();
 });
 it("shows preserved noncredit practice feedback and score",()=>{
   expect(projectSubmissionRevisionPage([row(1,{practiceResponse:true,teacherFeedback:"revise",demoScore:0,maxDemoScore:10})]).items[0]).toMatchObject({practiceFeedback:"revise",practiceScore:0,practiceScoreMax:10});
 });
});
