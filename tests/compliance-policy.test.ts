import {describe,expect,it} from "vitest";
import {evaluateEvidence,evaluateRuleWithExemption} from "../src/domain/qualification-policy";
const now=new Date("2026-10-15");
describe("evidence policy",()=>{
 it("requires multiple independent evidence types",()=>{
  const policy={op:"all" as const,rules:[{op:"evidence" as const,type:"degree"},{op:"evidence" as const,type:"license"}]};
  expect(evaluateEvidence(policy,[{type:"degree",verified:true,sourceId:"degree-1"}],now).satisfied).toBe(false);
  expect(evaluateEvidence(policy,[{type:"degree",verified:true,sourceId:"degree-1"},{type:"license",verified:true,sourceId:"license-1"}],now).satisfied).toBe(true);
 });
 it("rejects expired exemptions",()=>{
  const x=evaluateRuleWithExemption({ruleCode:"rule",subjectId:"person",qualification:{op:"credential",type:"cpr"},credentials:[],evidence:[],exemptions:[{ruleCode:"rule",subjectId:"person",approvedBy:"reviewer",reason:"one time",validFrom:new Date("2025-01-01"),validThrough:new Date("2026-01-01")}],asOf:now});
  expect(x.satisfied).toBe(false);
 });
});
