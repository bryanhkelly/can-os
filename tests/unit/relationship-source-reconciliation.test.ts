import {describe,it,expect} from "vitest";
import {reconcileRegistrationSource} from "@/domain/relationship-source-reconciliation";
describe("internal registration source join reconciliation",()=>{
 it("distinguishes no evidence from measured join coverage",()=>{
  expect(reconcileRegistrationSource(0,0)).toMatchObject({status:"no_source_evidence",sourceCompletenessVerified:false});
  expect(reconcileRegistrationSource(3,3)).toMatchObject({status:"source_join_reconciled",unmatchedRecords:0,sourceCompletenessVerified:false});
 });
 it("keeps unmatched base records visible rather than silently undercounting",()=>{
  expect(reconcileRegistrationSource(5,2)).toMatchObject({status:"source_join_incomplete",unmatchedRecords:3,sourceCompletenessVerified:false});
 });
 it("rejects impossible counts",()=>{
  for(const [a,b] of [[1,2],[-1,0],[1,0.5],[NaN,0],[Infinity,0]])expect(()=>reconcileRegistrationSource(a!,b!)).toThrow();
 });
});
