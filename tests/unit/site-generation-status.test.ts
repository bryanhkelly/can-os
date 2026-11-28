import {describe,it,expect} from "vitest";
import {generationEligibility,generationOutcomeMessage,legacyGlooRetryEligible,finalContentRecoveryFailure} from "../../src/domain/site-generation-status";
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

it("distinguishes missing runtime bindings before a claim",()=>{
 expect(generationEligibility({...base,configured:false,configurationError:"gloo_missing_key"})).toMatchObject({allowed:false,code:"gloo_missing_key",attempts:0});
});
it("only authorizes recovery for the old undiagnosed exhausted failure",()=>{
 expect(legacyGlooRetryEligible(failed)).toBe(true);
 for(const errorCode of ["legacy_retry_authorized","gloo_content_contract","processing_persistence"])expect(legacyGlooRetryEligible({...failed,errorCode})).toBe(false);
 expect(legacyGlooRetryEligible({...failed,attempts:2})).toBe(false);
 expect(legacyGlooRetryEligible({...failed,status:"ready"})).toBe(false);
 expect(generationEligibility({...base,attempt:{...failed,attempts:2,errorCode:"legacy_retry_authorized"}})).toMatchObject({allowed:true,code:"retry"});
});

it("permits a cooled-down final recovery for contract errors without an endless loop",()=>{
 const attempt={...failed,errorCode:"gloo_content_contract"};
 expect(generationEligibility({...base,attempt}).code).toBe("retry_cooldown");
 const later=new Date(now.getTime()+300001);
 expect(generationEligibility({...base,attempt,now:later})).toMatchObject({allowed:true,code:"content_recovery",attempts:3});
 const terminal=finalContentRecoveryFailure(attempt.errorCode,true);
 expect(terminal).toBe("gloo_content_retry_exhausted");
 expect(generationEligibility({...base,attempt:{...attempt,errorCode:terminal},now:later})).toMatchObject({allowed:false,code:"retry_limit"});
 expect(finalContentRecoveryFailure(attempt.errorCode,false)).toBe(attempt.errorCode);
 expect(finalContentRecoveryFailure("gloo_http_401",true)).toBe("gloo_content_retry_exhausted");
});
