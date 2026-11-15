import { describe, expect, it } from "vitest";
import { roleCapabilities } from "@/domain/access-context";
import {
  assertCANIdentityReviewer, canApproveSiteIdentity,
  siteIdentityRequestSchema, siteIdentityReviewSchema,
} from "@/domain/site-identity-review";
import type { AccessContext } from "@/domain/access-context";

const a="11110000-0000-4000-8000-000000000001";
const b="22220000-0000-4000-8000-000000000002";
const actor:AccessContext={
  accountId:a,sessionId:b,grantId:a,grantSiteId:null,
  role:"can_network_steward",actorPersonId:a,
  capabilities:new Set(roleCapabilities.can_network_steward),
  scope:{organizationIds:[b],siteIds:[]},
};

describe("independent Site identity review policy",()=>{
  it("requires an evidence-backed exact Site request",()=>{
    const good={publicSiteId:a,canonicalSiteId:b,evidenceReference:"signed-site-agreement-v1"};
    expect(siteIdentityRequestSchema.parse(good)).toEqual(good);
    expect(siteIdentityRequestSchema.safeParse({...good,evidenceReference:"same name"}).success).toBe(false);
    expect(siteIdentityRequestSchema.safeParse({...good,siteId:"untrusted"}).success).toBe(false);
  });

  it("never allows self-approval or absence of native confirmation",()=>{
    const base={requesterPersonId:a,reviewerPersonId:b,
      canonicalConfirmedAt:new Date("2026-11-15T00:00:00Z"),
      canonicalOperatorStillAuthorized:true};
    expect(canApproveSiteIdentity(base)).toBe(true);
    expect(canApproveSiteIdentity({...base,reviewerPersonId:a})).toBe(false);
    expect(canApproveSiteIdentity({...base,canonicalConfirmedAt:null})).toBe(false);
    expect(canApproveSiteIdentity({...base,canonicalOperatorStillAuthorized:false})).toBe(false);
  });

  it("restricts reviewer to a CAN institutional steward, independent of networks",()=>{
    expect(()=>assertCANIdentityReviewer(actor,{id:b,type:"can_network"})).not.toThrow();
    expect(()=>assertCANIdentityReviewer({...actor,role:"network_admin"},
      {id:b,type:"can_network"})).toThrow();
    expect(()=>assertCANIdentityReviewer({...actor,grantSiteId:a},
      {id:b,type:"can_network"})).toThrow();
    expect(()=>assertCANIdentityReviewer(actor,{id:b,type:"church"})).toThrow();
    expect(()=>assertCANIdentityReviewer({...actor,sessionAccountId:a},
      {id:b,type:"can_network"})).toThrow();
  });

  it("requires a meaningful reason for every review decision",()=>{
    const valid={publicSiteId:a,decision:"approve" as const,
      reason:"Independent records and exact Site authorization verified."};
    expect(siteIdentityReviewSchema.safeParse(valid).success).toBe(true);
    expect(siteIdentityReviewSchema.safeParse({...valid,reason:"yes"}).success).toBe(false);
    expect(siteIdentityReviewSchema.safeParse({...valid,decision:"auto"}).success).toBe(false);
  });
});
