import {describe,it,expect} from "vitest";
import {relationshipDisclosureDigest,type RelationshipDisclosureScope} from "@/domain/relationship-report-disclosure";
import {resolveStoredRelationshipDisclosureApproval,type StoredRelationshipDisclosureReview} from "@/domain/stored-relationship-disclosure-review";
const now=new Date("2026-11-28T12:00:00Z");
const scope:RelationshipDisclosureScope={recipientOrganizationId:"recipient",population:"real",metric:{metricKey:"class.registrations",definitionVersion:"0.1.0"},from:"2026-11-01T00:00:00Z",to:"2026-11-25T00:00:00Z",asOf:"2026-11-26T00:00:00Z",agreementIds:["a"],manifestDigest:"a".repeat(64)};
async function reviewed():Promise<StoredRelationshipDisclosureReview>{return {id:"review",recipientOrganizationId:"recipient",population:"real",scopeDigest:await relationshipDisclosureDigest(scope),manifestDigest:scope.manifestDigest,reviewEvidenceDigest:"b".repeat(64),preparedByPersonId:"preparer",reviewedByPersonId:"reviewer",preparedAt:scope.asOf,approvedAt:"2026-11-27T00:00:00Z",expiresAt:"2026-12-01T00:00:00Z",revokedAt:null,sourceCompletenessReviewed:true,suppressSmallCells:true,reviewedOverlappingCuts:true,reviewedHistoricalDifferencing:true};}
describe("stored independent disclosure review",()=>{
 it("adapts only the exact current reviewed scope",async()=>{
  const row=await reviewed();
  expect(await resolveStoredRelationshipDisclosureApproval(row,scope,now)).toMatchObject({approvalId:"review",approvedAudience:"organization:recipient"});
  for(const change of [{manifestDigest:"c".repeat(64)},{agreementIds:["a","b"]},{population:"synthetic" as const},{recipientOrganizationId:"other"},{metric:{...scope.metric,definitionVersion:"2"}}])expect(await resolveStoredRelationshipDisclosureApproval(row,{...scope,...change},now)).toBeNull();
 });
 it("rejects self-review, revoked, expired, future and incomplete evidence",async()=>{
  const row=await reviewed();
  for(const change of [{reviewedByPersonId:"preparer"},{revokedAt:now.toISOString()},{expiresAt:now.toISOString()},{approvedAt:"2026-11-29T00:00:00Z"},{preparedAt:"2026-11-25T00:00:00Z"},{sourceCompletenessReviewed:false},{reviewedOverlappingCuts:false},{reviewedHistoricalDifferencing:false},{suppressSmallCells:false},{reviewEvidenceDigest:"invalid"}])expect(await resolveStoredRelationshipDisclosureApproval({...row,...change},scope,now)).toBeNull();
  expect(await resolveStoredRelationshipDisclosureApproval(null,scope,now)).toBeNull();
 });
});
