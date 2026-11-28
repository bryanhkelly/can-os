import {relationshipDisclosureDigest,type RelationshipDisclosureScope} from "./relationship-report-disclosure";
import type {PublicationDisclosureApproval} from "./network-reporting-authorization";

/** Private evidence of an independently performed review, loaded from trusted
 * storage, never an HTTP body. No caller may use this as source authority. */
export type StoredRelationshipDisclosureReview={
 id:string;recipientOrganizationId:string;population:"real"|"synthetic";scopeDigest:string;
 manifestDigest:string;reviewEvidenceDigest:string;preparedByPersonId:string;reviewedByPersonId:string;
 preparedAt:string;approvedAt:string;expiresAt:string;revokedAt:string|null;
 sourceCompletenessReviewed:boolean;suppressSmallCells:boolean;
 reviewedOverlappingCuts:boolean;reviewedHistoricalDifferencing:boolean;
};
const digest=(s:string)=>/^[a-f0-9]{64}$/.test(s);
export async function resolveStoredRelationshipDisclosureApproval(
 record:StoredRelationshipDisclosureReview|null,scope:RelationshipDisclosureScope,now:Date,
):Promise<PublicationDisclosureApproval|null>{
 if(!record)return null;
 const current=now.getTime(),prepared=Date.parse(record.preparedAt),approved=Date.parse(record.approvedAt),expires=Date.parse(record.expiresAt),asOf=Date.parse(scope.asOf);
 if(![current,prepared,approved,expires,asOf].every(Number.isFinite)||asOf>prepared||prepared>approved||approved>current||expires<=current||
    !record.id||!record.preparedByPersonId||!record.reviewedByPersonId||record.preparedByPersonId===record.reviewedByPersonId||
    record.revokedAt!==null||record.recipientOrganizationId!==scope.recipientOrganizationId||record.population!==scope.population||
    !digest(record.reviewEvidenceDigest)||record.manifestDigest!==scope.manifestDigest||!digest(record.scopeDigest)||
    !record.sourceCompletenessReviewed||!record.suppressSmallCells||!record.reviewedOverlappingCuts||!record.reviewedHistoricalDifferencing)return null;
 if(record.scopeDigest!==await relationshipDisclosureDigest(scope))return null;
 return {approvalId:record.id,approvedAt:record.approvedAt,expiresAt:record.expiresAt,queryScopeDigest:record.scopeDigest,
  approvedAudience:"organization:"+record.recipientOrganizationId,suppressSmallCells:true,reviewedOverlappingCuts:true,reviewedHistoricalDifferencing:true};
}
