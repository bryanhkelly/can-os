import { describe, expect, it } from "vitest";
import {
  summarizeNoncreditPilot,publicationSafePilotSummary,attributableNoncreditFeedback,
  countDistinctNoncreditLearners,NONCREDIT_PILOT_COUNT_DEFINITIONS,
  type PilotParticipantFact,
} from "@/domain/noncredit-pilot-outcomes";
const sample: PilotParticipantFact={
 registrationId:"r1",trainingVersionId:"t1",registered:true,engaged:true,
 completedLessonCount:4,totalLessonCount:5,knowledgeSubmitted:true,
 knowledgeResult:"pass",surveySubmitted:true,completionRecorded:false,
 baselineFraction:0.4,finalFraction:0.8,
};
describe("noncredit pilot reporting",()=>{
 it("defines distinct stable source contracts for all existing pilot count cards",()=>{
  const keys=NONCREDIT_PILOT_COUNT_DEFINITIONS.map(item=>item.key);
  expect(new Set(keys).size).toBe(keys.length);
  expect(keys).toContain("distinctLearners");
  expect(keys).toContain("confirmedNoncreditCompletions");
  expect(NONCREDIT_PILOT_COUNT_DEFINITIONS.every(item=>
    !!item.source&&!!item.denominator&&!!item.timeBasis&&!!item.rule)).toBe(true);
 });

 it("distinguishes engagement, passing and confirmed completion",()=>{
  const s=summarizeNoncreditPilot([sample]);
  expect(s).toMatchObject({registrations:1,engagedParticipants:1,
    knowledgeCheckSubmissions:1,knowledgeCheckPasses:1,
    confirmedNoncreditCompletions:0,pairedKnowledgeChecks:1});
  expect(s.averageImprovementPercentagePoints).toBeCloseTo(40);
 });
 it("requires actual paired diagnostics to claim knowledge improvement",()=>{
  const s=summarizeNoncreditPilot([{...sample,baselineFraction:null}]);
  expect(s.pairedKnowledgeChecks).toBe(0);
  expect(s.averageImprovementPercentagePoints).toBeNull();
 });
 it("hides small groups from public/partner summaries",()=>{
  const summary=summarizeNoncreditPilot(Array.from({length:12},(_,i)=>({
   ...sample,registrationId:"r"+i,knowledgeResult:i<8?"pass" as const:"fail" as const,
   completionRecorded:i<3,surveySubmitted:i<8,
  })));
  const safe=publicationSafePilotSummary(summary);
  expect(safe.publishable).toBe(true);
  expect(safe.summary?.registrations).toBe(12);
  expect(safe.summary?.knowledgeCheckPasses).toBeNull();
  expect(safe.summary?.confirmedNoncreditCompletions).toBeNull();
  expect(safe.summary?.pairedKnowledgeChecks).toBe(12);
  expect(publicationSafePilotSummary(summarizeNoncreditPilot([sample])).publishable).toBe(false);
 });
 it("refuses double-counted registrations",()=>{
  expect(()=>summarizeNoncreditPilot([sample,sample])).toThrow("Duplicate pilot");
 });
 it("credits feedback only to one matching enrollment after registration",()=>{
  const registeredAt=new Date("2026-11-01T12:00:00Z");
  const valid={offeringId:"offering-a",registrationsForPersonOffering:1,
    registeredAt,latestSubmittedAt:new Date("2026-11-01T13:00:00Z")};
  expect(attributableNoncreditFeedback(valid)).toBe(true);
  expect(attributableNoncreditFeedback({...valid,offeringId:null})).toBe(false);
  expect(attributableNoncreditFeedback({...valid,registrationsForPersonOffering:2})).toBe(false);
  expect(attributableNoncreditFeedback({...valid,registrationsForPersonOffering:0})).toBe(false);
  expect(attributableNoncreditFeedback({...valid,latestSubmittedAt:null})).toBe(false);
  expect(attributableNoncreditFeedback({...valid,
    latestSubmittedAt:new Date("2026-10-30T11:00:00Z")})).toBe(false);
  expect(attributableNoncreditFeedback({...valid,
    latestSubmittedAt:new Date("invalid")})).toBe(false);
 });
 it("counts distinct learners across repeats and Sites without exposing identities",()=>{
  expect(countDistinctNoncreditLearners([])).toBe(0);
  expect(countDistinctNoncreditLearners(["person-a","person-a","person-b"])).toBe(2);
  expect(()=>countDistinctNoncreditLearners(["person-a",""])).toThrow("canonical Person");
 });
});
