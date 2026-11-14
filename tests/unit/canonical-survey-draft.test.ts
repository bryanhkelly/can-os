import { describe, expect, it } from "vitest";
import { createSurveyDraftInput, canonicalSurveyDraftDatabaseRole } from "@/domain/canonical-survey-draft";
const org="11110000-0000-4000-8000-000000000001";
const base={
 code:"pilot_01", title:"Pilot Feedback", purposeCode:"training_feedback",
 intendedAudience:"learner",
 questions:[{prompt:"How useful was this module?",type:"rating",
   required:true,options:[],ratingMin:1,ratingMax:5}],
};
describe("canonical survey draft validation",()=>{
 it("accepts generic reusable questions without embedding a particular organization",()=>{
  expect(createSurveyDraftInput.parse(base).questions).toHaveLength(1);
 });
 it("uses the standard 0 to 10 net promoter score range",()=>{
  const q = {...base.questions[0], type:"nps", ratingMin:0, ratingMax:10};
  expect(createSurveyDraftInput.safeParse({...base, questions:[q]}).success).toBe(true);
  expect(createSurveyDraftInput.safeParse({...base, questions:[{...q, ratingMin:1}]}).success).toBe(false);
 });
 it("rejects unreviewable or unsupported survey question shapes",()=>{
  expect(createSurveyDraftInput.safeParse({...base,questions:[{...base.questions[0],type:"matrix"}]}).success).toBe(false);
  expect(createSurveyDraftInput.safeParse({...base,questions:[{...base.questions[0],type:"single_choice",options:["Yes","yes"],ratingMin:null,ratingMax:null}]}).success).toBe(false);
  expect(createSurveyDraftInput.safeParse({...base,questions:[{...base.questions[0],type:"text",ratingMin:1,ratingMax:5}]}).success).toBe(false);
 });
 it("constructs a DB role solely from verified canonical scope and capability",()=>{
  expect(canonicalSurveyDraftDatabaseRole({scope:{organizationIds:[org]},capabilities:new Set(["survey.draft.create"])}))
   .toBe("can_v30_survey_draft_author_11110000000040008000000000000001");
  expect(()=>canonicalSurveyDraftDatabaseRole({scope:{organizationIds:[org]},capabilities:new Set()})).toThrow();
  expect(()=>canonicalSurveyDraftDatabaseRole({scope:{organizationIds:[org,org]},capabilities:new Set(["survey.draft.create"])})).toThrow();
 });
});
