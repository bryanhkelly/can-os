import { beforeEach, describe, expect, it, vi } from "vitest";
import { sourceDigest, approvedIdentityFacts } from "@/domain/public-parent-identity";

const state=vi.hoisted(()=>({
  siteRevision:new Date("2026-11-03T12:00:00.000Z"),
  metadata:{} as Record<string,unknown>,
  updates:[] as Array<Record<string,unknown>>,
  audit:[] as unknown[],
}));
const siteId="78816489-b760-4667-b559-9b89dc8ec6ce";
const userId="9ea723b5-a539-4217-8b1a-42ba6e4ef56e";
const address={
  street1:"102 School Road",city:"Oakland",state:"CA",
  postalCode:"94612",country:"US",
};
const contact={
  displayName:"Academy Admissions",email:"hello@academy.example",
  phone:"510-555-0100",website:"https://academy.example",
};
vi.mock("@/modules/sites/site-publication.server",()=>({
  requireSitePublisher:vi.fn(async()=>({
    id:"78816489-b760-4667-b559-9b89dc8ec6ce",
    organizationId:"b560243b-256d-4d30-8d84-9ae428276e51",
  })),
}));
vi.mock("@/platform/mutation",()=>({
  writeAudit:vi.fn(async (_tx,_actor,payload)=>{
    state.audit.push(payload);
  }),
}));
vi.mock("@/db/client",()=>({
  db:{
    transaction:async (fn:(tx:unknown)=>Promise<unknown>)=>fn({
      select:()=>({
        from(){return this},where(){return this},for(){return this},
        limit(){return Promise.resolve([{
          address:{
            street1:"102 School Road",city:"Oakland",state:"CA",
            postalCode:"94612",country:"US",
          },
          metadata:state.metadata,updatedAt:state.siteRevision,
        }])},
      }),
      update:()=>({
        set(value:Record<string,unknown>){state.updates.push(value);return this},
        where(){return Promise.resolve()},
      }),
    }),
    select:()=>({
      from(){return this},where(){return this},
      limit(){return Promise.resolve([{
        address:{
          street1:"102 School Road",city:"Oakland",state:"CA",
          postalCode:"94612",country:"US",
        },
        metadata:state.metadata,updatedAt:state.siteRevision,
      }])},
    }),
  },
}));
import {
  changeSiteParentIdentityReview, getSiteParentIdentityReview,
} from "./site-parent-identity-review.server";
import { requireSitePublisher } from "./site-publication.server";

const actor={
  actorPersonId:userId,
  accountId:"a",sessionId:"s",grantId:"g",
  grantSiteId:siteId,role:"registrar",
  capabilities:new Set(["site.publication.manage"]),
  scope:{organizationIds:["b560243b-256d-4d30-8d84-9ae428276e51"],siteIds:[siteId]},
} as Parameters<typeof changeSiteParentIdentityReview>[0];
const addressDigest=sourceDigest(siteId,"address",{
  street1:address.street1,street2:"",city:address.city,
  state:address.state,postalCode:address.postalCode,country:address.country,county:"",
});
const contactDigest=sourceDigest(siteId,"contact",contact);
const input=()=>({
  siteId,expectedSiteRevision:"2026-11-03T12:00:00.000Z",
  expectedReviewRevision:0,
  addressDecision:"approve" as const,
  contactDecision:"approve" as const,
  expectedAddressDigest:addressDigest,
  expectedContactDigest:contactDigest,
  publicLocationConfirmed:true,
  schoolControlledContactConfirmed:true,
  expiresOn:"2027-01-15",
  reviewed:true as const,
  reason:"Verified current Site public communication authority",
  evidenceReference:"Audited school publisher evidence 2026-11-03",
});

describe("institutional public Site identity review writer",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();state.updates=[];state.audit=[];
    state.siteRevision=new Date("2026-11-03T12:00:00.000Z");
    state.metadata={setupContact:contact};
  });

  it("requires verified Site publisher, canonical source and explicit reviewer attestations",async()=>{
    const view=await getSiteParentIdentityReview(actor,siteId);
    expect(view.address.digest).toBe(addressDigest);
    expect(view.contact.digest).toBe(contactDigest);
    expect(view.address.publicApproved).toBe(false);
    const result=await changeSiteParentIdentityReview(actor,input(),
      new Date("2026-11-03T20:00:00.000Z"));
    expect(result.addressApproved).toBe(true);
    expect(result.contactApproved).toBe(true);
    expect(state.audit).toHaveLength(1);
    expect(vi.mocked(requireSitePublisher)).toHaveBeenCalledWith(
      actor,siteId,expect.anything());
    const metadata=state.updates[0]?.metadata as Record<string,unknown>;
    expect(approvedIdentityFacts(siteId,address,metadata,
      new Date("2026-11-04T00:00:00Z")).publicContact?.canDisplay).toBe(true);
    expect(JSON.stringify(state.audit)).not.toContain("102 School Road");
  });

  it("fails closed for stale Site revision or changed reviewed source",async()=>{
    await expect(changeSiteParentIdentityReview(actor,{
      ...input(),expectedSiteRevision:"2026-11-02T12:00:00.000Z",
    })).rejects.toThrow(/changed/);
    await expect(changeSiteParentIdentityReview(actor,{
      ...input(),expectedContactDigest:"0".repeat(64),
    })).rejects.toThrow(/contact is missing or changed/);
    expect(state.updates).toHaveLength(0);
  });

  it("refuses approval with missing authority attestation, missing channel or expired review",async()=>{
    await expect(changeSiteParentIdentityReview(actor,{
      ...input(),publicLocationConfirmed:false,
    })).rejects.toThrow();
    state.metadata={setupContact:{...contact,email:"",phone:"",website:""}};
    await expect(changeSiteParentIdentityReview(actor,input())).rejects.toThrow();
    state.metadata={setupContact:contact};
    await expect(changeSiteParentIdentityReview(actor,{
      ...input(),expiresOn:"2026-10-01",
    },new Date("2026-11-03T20:00:00Z"))).rejects.toThrow(/expiry/);
    expect(state.updates).toHaveLength(0);
  });

  it("withdraws both public claims without retaining old approved digests",async()=>{
    state.metadata={...state.metadata,publicParentIdentityReview:{
      version:1,revision:2,reviewedByPersonId:userId,
      reviewedAt:"2026-11-01T00:00:00Z",expiresOn:"2026-12-01",
      addressDigest,contactDigest,
    }};
    const result=await changeSiteParentIdentityReview(actor,{
      ...input(),expectedReviewRevision:2,
      addressDecision:"withdraw",contactDecision:"withdraw",
      expectedAddressDigest:null,expectedContactDigest:null,
      publicLocationConfirmed:false,schoolControlledContactConfirmed:false,
      expiresOn:null,
    },new Date("2026-11-03T20:00:00Z"));
    expect(result.reviewRevision).toBe(3);
    expect(result.addressApproved).toBe(false);
    expect(result.contactApproved).toBe(false);
    const metadata=state.updates[0]?.metadata as Record<string,unknown>;
    expect(approvedIdentityFacts(siteId,address,metadata,
      new Date("2026-11-04T00:00:00Z"))).toEqual({});
  });
});
