import { describe, expect, it } from "vitest";
import { approvedIdentityFacts, publicIdentityReviewStatuses, sourceDigest } from "./public-parent-identity";

const siteId="c5831f4e-d62a-4d70-a810-2f8695293a23";
const now=new Date("2026-11-03T18:00:00.000Z");
const address={
  street1:"123 Approved Street",city:"Oakland",state:"CA",
  postalCode:"94612",country:"US",
};
const contact={
  displayName:"Admissions Office",email:"admissions@example.edu",
  phone:"555-100-2000",website:"https://example.edu",
};
const addressPayload={
  street1:address.street1,street2:"",city:address.city,
  state:address.state,postalCode:address.postalCode,
  country:address.country,county:"",
};
const approval={
  version:1,revision:3,
  reviewedByPersonId:"79b97826-995e-49e6-a770-47bffecf3b57",
  reviewedAt:"2026-10-10T10:00:00.000Z",
  expiresOn:"2026-12-01",
  addressDigest:sourceDigest(siteId,"address",addressPayload),
  contactDigest:sourceDigest(siteId,"contact",contact),
};
const current={setupContact:contact,publicParentIdentityReview:approval};

describe("public parent Site identity independent approval gate",()=>{
  it("does not publish a physical Site address or draft setup contact without review",()=>{
    expect(approvedIdentityFacts(siteId,address,{setupContact:contact},now)).toEqual({});
    expect(approvedIdentityFacts(siteId,address,null,now)).toEqual({});
  });
  it("projects only exact-current institutionally reviewed address and school contact",()=>{
    const projected=approvedIdentityFacts(siteId,address,current,now);
    expect(projected.publicAddress?.canDisplay).toBe(true);
    expect(projected.publicAddress?.revision).toBe(3);
    expect(projected.publicContact?.value).toContain("admissions@example.edu");
    expect(JSON.stringify(projected)).not.toContain("reviewedByPersonId");
  });
  it("requires a finite valid approval expiry, including for historical metadata",()=>{
    const noExpiry={...current,publicParentIdentityReview:{...approval,expiresOn:null}};
    expect(approvedIdentityFacts(siteId,address,noExpiry,now)).toEqual({});
    expect(publicIdentityReviewStatuses(siteId,address,noExpiry,now)).toEqual({
      address:"expired",contact:"expired",
    });
    const futureReview={...current,publicParentIdentityReview:{
      ...approval,reviewedAt:"2026-12-10T00:00:00.000Z",
    }};
    expect(approvedIdentityFacts(siteId,address,futureReview,now)).toEqual({});
    expect(publicIdentityReviewStatuses(siteId,address,futureReview,now).contact).toBe("expired");
  });
  it("distinguishes never reviewed, changed, expired, withdrawn and active approval",()=>{
    expect(publicIdentityReviewStatuses(siteId,address,null,now).address)
      .toBe("never_reviewed");
    expect(publicIdentityReviewStatuses(siteId,address,current,now).contact)
      .toBe("approved");
    expect(publicIdentityReviewStatuses(siteId,{...address,street1:"New Road"},current,now).address)
      .toBe("source_changed");
    expect(publicIdentityReviewStatuses(siteId,address,{
      ...current,setupContact:{...contact,email:"new@example.edu"},
    },now).contact).toBe("source_changed");
    expect(publicIdentityReviewStatuses(siteId,address,{
      ...current,publicParentIdentityReview:{...approval,contactDigest:null},
    },now).contact).toBe("withdrawn");
    expect(publicIdentityReviewStatuses(siteId,address,{
      ...current,publicParentIdentityReview:{...approval,expiresOn:"2026-11-01"},
    },now).address).toBe("expired");
  });
  it("invalidates any changed, expired or revoked source without a refresh flag",()=>{
    expect(approvedIdentityFacts(siteId,{...address,street1:"456 New Street"},current,now)
      .publicAddress).toBeUndefined();
    expect(approvedIdentityFacts(siteId,address,{
      ...current,setupContact:{...contact,email:"private@example.edu"},
    },now).publicContact).toBeUndefined();
    expect(approvedIdentityFacts(siteId,address,{
      ...current,publicParentIdentityReview:{...approval,expiresOn:"2026-11-01"},
    },now)).toEqual({});
    expect(approvedIdentityFacts(siteId,address,{
      ...current,publicParentIdentityReview:null,
    },now)).toEqual({});
    expect(approvedIdentityFacts("19e83799-4094-4543-95eb-0c433595506c",
      address,current,now)).toEqual({});
  });
});
