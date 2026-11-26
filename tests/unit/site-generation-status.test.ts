import {describe,it,expect} from "vitest";
import {generationEligibility,generationOutcomeMessage} from "../../src/domain/site-generation-status";
const now=new Date("2026-11-26T06:42:00Z");
const base={attempt:null,activeUntil:null,dailyCount:0,configured:true,now};
const failed={status:"failed",attempts:3,errorCode:"processing_failed",updatedAt:now};
describe("Site Intelligence generation policy",()=>{
 it("blocks exhausted attempts on the exact input",()=>expect(generationEligibility({...base,attempt:failed})).toMatchObject({allowed:false,code:"retry_limit",attempts:3}));
 it("permits a new input subject to daily limits",()=>{
  expect(generationEligibility(base).allowed).toBe(true);
  expect(generationEligibility({...base,dailyCount:5}).code).toBe("daily_limit");
 });
 it("prevents concurrent processing and missing configuration",()=>{
  expect(generationEligibility({...base,activeUntil:new Date(now.getTime()+1000)}).code).toBe("processing");
  expect(generationEligibility({...base,configured:false}).code).toBe("provider_unavailable");
 });
 it("preserves reusable saved output without a provider",()=>expect(generationEligibility({...base,configured:false,attempt:{...failed,status:"ready"}})).toMatchObject({allowed:true,code:"ready"}));
 it("preserves provider correction cooldown",()=>{
  const attempt={...failed,errorCode:"gloo_http_401"};
  expect(generationEligibility({...base,attempt}).code).toBe("retry_cooldown");
  expect(generationEligibility({...base,attempt,now:new Date(now.getTime()+300001)}).allowed).toBe(true);
 });
 it("never reports failed or active processing as success",()=>{
  expect(generationOutcomeMessage({status:"failed",code:"retry_limit",message:"Blocked"}).success).toBe(false);
  expect(generationOutcomeMessage({status:"processing"}).success).toBe(false);
  expect(generationOutcomeMessage({status:"reused"}).success).toBe(true);
 });
});
