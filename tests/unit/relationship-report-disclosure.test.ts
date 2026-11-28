import {describe,it,expect} from "vitest";
import {relationshipDisclosureDigest,discloseRelationshipMetric} from "@/domain/relationship-report-disclosure";
const now=new Date("2026-11-28T12:00:00Z");
const scope={recipientOrganizationId:"recipient",population:"real" as const,metric:{metricKey:"class.registrations",definitionVersion:"0.1.0"},from:"2026-11-01T00:00:00Z",to:"2026-11-25T00:00:00Z",asOf:"2026-11-26T00:00:00Z",agreementIds:["a","b"],manifestDigest:"a".repeat(64)};
async function approved(){
 const queryScopeDigest=await relationshipDisclosureDigest(scope);
 return {scope,sourceCompletenessVerified:true,value:20,distinctContributors:10,currentAgreementIds:new Set(["a","b"]),approval:{approvalId:"review",approvedAt:"2026-11-27T00:00:00Z",expiresAt:"2026-12-01T00:00:00Z",queryScopeDigest,approvedAudience:"organization:recipient",suppressSmallCells:true,reviewedOverlappingCuts:true,reviewedHistoricalDifferencing:true}};
}
describe("exact cross-organization disclosure gate",()=>{
 it("pins exact approved metric, population, period, manifest, audience and agreement set",async()=>{
  const input=await approved();
  expect(await discloseRelationshipMetric(input,now)).toMatchObject({status:"available",value:20});
  for(const change of [{manifestDigest:"b".repeat(64)},{population:"synthetic" as const},{agreementIds:["a"]},{to:"2026-11-24T00:00:00Z"},{metric:{...scope.metric,definitionVersion:"2"}}]){
   await expect(discloseRelationshipMetric({...input,scope:{...scope,...change}},now)).rejects.toThrow();
  }
  await expect(discloseRelationshipMetric({...input,approval:{...input.approval,approvedAudience:"organization:other"}},now)).rejects.toThrow();
 });
 it("suppresses small cells without leaking contributor counts",async()=>{
  const input=await approved();
  const output=await discloseRelationshipMetric({...input,distinctContributors:9},now);
  expect(output).toMatchObject({status:"suppressed",value:null});
  expect(output).not.toHaveProperty("distinctContributors");
  expect(output).not.toHaveProperty("agreementIds");
 });
 it("rejects incomplete, expired, revoked or unreviewed evidence",async()=>{
  const input=await approved();
  for(const change of [{sourceCompletenessVerified:false},{currentAgreementIds:new Set(["a"])},{approval:null},{approval:{...input.approval,reviewedHistoricalDifferencing:false}},{approval:{...input.approval,expiresAt:now.toISOString()}}]){
   await expect(discloseRelationshipMetric({...input,...change},now)).rejects.toThrow();
  }
 });
 it("rejects malformed, duplicate or unbounded scope before hashing",async()=>{
  for(const change of [{manifestDigest:"invalid"},{agreementIds:["a","a"]},{from:scope.to},{to:"2026-11-27T00:00:00Z"}]){
   await expect(relationshipDisclosureDigest({...scope,...change})).rejects.toThrow();
  }
  expect(await relationshipDisclosureDigest({...scope,agreementIds:["b","a"]})).toBe(await relationshipDisclosureDigest(scope));
 });
});
