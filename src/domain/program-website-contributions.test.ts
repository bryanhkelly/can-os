import {describe,it,expect} from "vitest";
import {pendingExtendedProgramWebsiteBlocks,programWebsiteContribution,projectProgramLaunchWebsiteBlocks} from "./program-website-contributions";
import type {SiteEnrollmentOpportunity} from "./site-enrollment-opportunities";
import type {SiteContentBlockProjection} from "./site-content-channels";
const course:SiteEnrollmentOpportunity={id:"course:c",kind:"course",targetId:"c",title:"Digital skills",description:"Reviewed learning opportunity",status:"register",action:{label:"Register",href:"https://example.test/learn/enroll?release=c"}};
const cls:SiteEnrollmentOpportunity={id:"class:k",kind:"class",targetId:"k",title:"Facilitated AI",description:"Facilitated",status:"explore"};
describe("Program launch website contributions",()=>{
 it("selects an internal recipe from canonical Program type",()=>{
  expect(programWebsiteContribution("summer_enrichment").pages).toEqual(["/programs","/student-life"]);
  expect(programWebsiteContribution("full_school").pages).toContain("/admissions");
 });
 it("does not create public website content without an approved feed",()=>{
  expect(projectProgramLaunchWebsiteBlocks([],[],false)).toEqual([]);
 });
 it("adds native offerings without regenerating the Site or opening new registration",()=>{
  const result=projectProgramLaunchWebsiteBlocks([],[course,cls,course],false);
  expect(result.flatMap(b=>b.items.map(i=>i.id))).toEqual(["course:c","class:k"]);
  expect(result[0]?.items[0]?.link).toEqual(course.action);
  expect(result[1]?.items[0]?.link).toBeUndefined();
  expect(projectProgramLaunchWebsiteBlocks([],[course],true)[0]?.items[0]?.link).toBeUndefined();
 });
 it("preserves existing authored home content and deduplicates exact targets",()=>{
  const authored:SiteContentBlockProjection={id:"my-courses",channel:"learning.noncredit",page:"/",placement:"learning",layout:"cards",enabled:true,eyebrow:"Learn",title:"Our courses",description:"",items:[{id:"c",title:"Digital skills",description:"",label:"Reviewed"}]};
  expect(projectProgramLaunchWebsiteBlocks([authored],[course],false)).toEqual([authored]);
 });
 it("shows only a scoped noncredit planning card and never an action",()=>{
  const input={programId:"p",name:"Summer Discovery",type:"summer_enrichment" as const,status:"launching",hasPublishedOffering:false};
  const blocks=pendingExtendedProgramWebsiteBlocks(input);
  expect(blocks.map(b=>b.page)).toEqual(["/","/programs"]);
  expect(blocks[0]?.items[0]?.link).toBeUndefined();
  expect(pendingExtendedProgramWebsiteBlocks({...input,hasPublishedOffering:true})).toEqual([]);
  expect(pendingExtendedProgramWebsiteBlocks({...input,status:"closed"})).toEqual([]);
 });
});
