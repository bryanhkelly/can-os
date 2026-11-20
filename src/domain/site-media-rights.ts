/** Canonical public-media eligibility, independent of the storage provider.
 * Site Brand identity assets and Site photo-library Documents use this one
 * decision, with provider-specific ownership and immutable-key checks outside.
 */
export type SiteMediaUsageReview={
  rightsStatus:"approved"|"pending"|"revoked";
  subjectReleaseStatus:"cleared"|"not_required"|"pending"|"revoked";
  revoked:boolean;
  altText?:string|null;
};
export function approvedSiteMediaUsage(review:SiteMediaUsageReview,requiresAltText=false):boolean{
  return !review.revoked &&
    review.rightsStatus==="approved" &&
    (review.subjectReleaseStatus==="cleared"||review.subjectReleaseStatus==="not_required") &&
    (!requiresAltText||Boolean(review.altText?.trim()));
}

/** Current approved Documents in the existing immutable R2 media library.
 * Filename heuristics and automatic tags never confer usage permission.
 */
export function approvedSiteDocumentMediaUsage(metadata:Record<string,unknown>):boolean{
  return metadata.mediaReviewStatus==="approved" &&
    approvedSiteMediaUsage({
      rightsStatus:metadata.rightsStatus==="approved"?"approved":"pending",
      subjectReleaseStatus:metadata.subjectReleaseStatus==="cleared"?"cleared":
        metadata.subjectReleaseStatus==="not_required"?"not_required":"pending",
      revoked:Boolean(metadata.revokedAt)||metadata.rightsStatus==="revoked",
      altText:typeof metadata.altText==="string"?metadata.altText:null,
    });
}
