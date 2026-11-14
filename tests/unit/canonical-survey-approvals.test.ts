import { describe,expect,it } from "vitest";
import {reviewGate,surveyApprovalDatabaseRole,recordSurveyReviewInput} from "@/domain/canonical-survey-approvals";
const org="11110000-0000-4000-8000-000000000001";
const author="44440000-0000-4000-8000-000000000001";
const reviewer="44440000-0000-4000-8000-000000000002";
const evidence="77770000-0000-4000-8000-000000000001";
const validEvidence=new Set([evidence]);
const decision=(kind:string,order:bigint,approval="approved",person=reviewer)=>({
 kind,decision:approval,reviewerPersonId:person,decisionOrder:order,evidenceVersionId:evidence,
});
describe("survey independent approval gate",()=>{
 it("requires latest independent approvals in all three mandatory domains",()=>{
  expect(reviewGate(author,[decision("privacy",1n),decision("accessibility",2n),decision("safeguarding",3n)],validEvidence).ready).toBe(true);
  expect(reviewGate(author,[decision("privacy",1n),decision("accessibility",2n)],validEvidence).ready).toBe(false);
 });
 it("new rejection or self-review overrides prior approval",()=>{
  expect(reviewGate(author,[decision("privacy",1n),decision("privacy",4n,"rejected"),
   decision("accessibility",2n),decision("safeguarding",3n)],validEvidence).ready).toBe(false);
  expect(reviewGate(author,[decision("privacy",1n),decision("accessibility",2n),decision("safeguarding",3n,"approved",author)],validEvidence).ready).toBe(false);
 });
 it("blocks approvals with stale or missing evidence",()=>{
  const rows=[decision("privacy",1n),decision("accessibility",2n),decision("safeguarding",3n)];
  expect(reviewGate(author,rows,new Set()).ready).toBe(false);
  expect(reviewGate(author,rows,validEvidence).ready).toBe(true);
 });
 it("refuses approval without evidence or a meaningful review rationale",()=>{
  const base={surveyVersionId:"88880000-0000-4000-8000-000000000001",
    kind:"privacy", decision:"approved",evidenceVersionId:null,
    rationale:"Privacy and disclosure controls were independently inspected."};
  expect(recordSurveyReviewInput.safeParse(base).success).toBe(false);
  expect(recordSurveyReviewInput.safeParse({...base,evidenceVersionId:evidence}).success).toBe(true);
  expect(recordSurveyReviewInput.safeParse({...base,evidenceVersionId:evidence,rationale:"ok"}).success).toBe(false);
 });
 it("derives separate reviewer and publisher DB roles only from trusted scope and capability",()=>{
  expect(surveyApprovalDatabaseRole({scope:{organizationIds:[org]},capabilities:new Set(["survey.review"])},"survey_reviewer"))
   .toBe("can_v30_survey_reviewer_11110000000040008000000000000001");
  expect(()=>surveyApprovalDatabaseRole({scope:{organizationIds:[org]},capabilities:new Set(["survey.review"])},"survey_publisher")).toThrow();
  expect(()=>surveyApprovalDatabaseRole({scope:{organizationIds:[org,org]},capabilities:new Set(["survey.publish"])},"survey_publisher")).toThrow();
 });
});
