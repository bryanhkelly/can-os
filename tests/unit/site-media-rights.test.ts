import { describe,expect,it } from "vitest";
import {
  approvedSiteMediaUsage, approvedSiteDocumentMediaUsage,
} from "@/domain/site-media-rights";
import { assertSiteBrandMediaRights, type SiteBrandAsset } from "@/domain/site-brand";

const approvedDocument={
  mediaReviewStatus:"approved",
  rightsStatus:"approved",
  subjectReleaseStatus:"cleared",
  storageVerified:true,
};
const logo:SiteBrandAsset={
  id:"11111111-1111-4111-8111-111111111111",
  siteId:"22222222-2222-4222-8222-222222222222",
  checksum:"a".repeat(64),
  dataUrl:"data:image/png;base64,AAAA",
  altText:"Community wordmark",rightsConfirmed:true,
  childImageConsent:"no_identifiable_children",
  revokedAt:null,
};

describe("shared rights decision across R2 Documents and Brand identities",()=>{
  it("permits actively approved media with cleared subjects",()=>{
    expect(approvedSiteDocumentMediaUsage(approvedDocument)).toBe(true);
    expect(approvedSiteDocumentMediaUsage({
      ...approvedDocument,subjectReleaseStatus:"not_required",
    })).toBe(true);
    expect(assertSiteBrandMediaRights(logo)).toBe(true);
  });
  it.each([
    {rightsStatus:"pending"},
    {rightsStatus:"revoked"},
    {subjectReleaseStatus:"pending"},
    {subjectReleaseStatus:"revoked"},
    {mediaReviewStatus:"pending"},
    {mediaReviewStatus:"rejected"},
    {revokedAt:"2026-11-19T00:00:00.000Z"},
  ])("fails closed for an unapproved Document state: %j",status=>{
    expect(approvedSiteDocumentMediaUsage({...approvedDocument,...status})).toBe(false);
  });
  it("rejects withdrawn, nonconsented, or uncaptioned Brand imagery",()=>{
    expect(assertSiteBrandMediaRights({...logo,revokedAt:"2026-11-19"})).toBe(false);
    expect(assertSiteBrandMediaRights({...logo,rightsConfirmed:false})).toBe(false);
    expect(assertSiteBrandMediaRights({...logo,childImageConsent:"unconfirmed"})).toBe(false);
    expect(assertSiteBrandMediaRights({...logo,altText:"   "})).toBe(false);
  });
  it("does not require alt text for decorative R2 photos but does for logos",()=>{
    expect(approvedSiteDocumentMediaUsage({...approvedDocument,altText:""})).toBe(true);
    expect(approvedSiteMediaUsage({rightsStatus:"approved",
      subjectReleaseStatus:"cleared",revoked:false,altText:""},true)).toBe(false);
  });
  it("allows no optional image, without bypassing the gate for images",()=>{
    expect(assertSiteBrandMediaRights(null)).toBe(true);
  });
});
