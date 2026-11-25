import {describe,expect,it} from "vitest";
import {engagementOwnerAllowsSite} from "@/domain/engagement-target-scope";
const orgA="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const orgB="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const siteA="11111111-1111-4111-8111-111111111111";
const siteB="22222222-2222-4222-8222-222222222222";
const site={id:siteA,organizationId:orgA,status:"active"};
describe("public universal Go destination owner boundaries",()=>{
  it("allows national platform navigation only from a canonical platform owner",()=>{
    expect(engagementOwnerAllowsSite({ownerKind:"platform",organizationId:null,siteId:null,programId:null},site)).toBe(true);
    expect(engagementOwnerAllowsSite({ownerKind:"platform",organizationId:orgA,siteId:null,programId:null},site)).toBe(false);
  });
  it("allows a network Organization's Sites and denies unrelated Organizations",()=>{
    const owner={ownerKind:"organization",organizationId:orgA,siteId:null,programId:null} as const;
    expect(engagementOwnerAllowsSite(owner,site)).toBe(true);
    expect(engagementOwnerAllowsSite(owner,{...site,organizationId:orgB})).toBe(false);
    expect(engagementOwnerAllowsSite(owner,{...site,id:siteB})).toBe(true);
  });
  it("never allows a Site-owned or Program-owned link into a sibling Site",()=>{
    for(const kind of ["site","program"] as const){
      const owner={ownerKind:kind,organizationId:orgA,siteId:siteA,
        programId:kind==="program"?"33333333-3333-4333-8333-333333333333":null};
      expect(engagementOwnerAllowsSite(owner,site)).toBe(true);
      expect(engagementOwnerAllowsSite(owner,{...site,id:siteB})).toBe(false);
      expect(engagementOwnerAllowsSite(owner,{...site,organizationId:orgB})).toBe(false);
    }
  });
  it("denies missing and closed targets",()=>{
    const owner={ownerKind:"platform",organizationId:null,siteId:null,programId:null} as const;
    expect(engagementOwnerAllowsSite(owner,null)).toBe(false);
    expect(engagementOwnerAllowsSite(owner,{...site,status:"closed"})).toBe(false);
    expect(engagementOwnerAllowsSite(owner,{...site,status:null})).toBe(false);
    expect(engagementOwnerAllowsSite(owner,{...site,status:"unexpected"})).toBe(false);
    expect(engagementOwnerAllowsSite(owner,{...site,status:"planning"})).toBe(true);
  });
});
