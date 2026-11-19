import { beforeEach, describe, expect, it, vi } from "vitest";

const calls=vi.hoisted(()=>({
  listInvitations:vi.fn(),
  listPackages:vi.fn(),
  suggestions:vi.fn(),
}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=> (options:unknown)=>({options}),
  Link:()=>null,
  useRouter:()=>({invalidate:vi.fn()}),
}));
vi.mock("@/modules/enrollment/family-invitations.functions",()=>({
  listFamilyInvitations:calls.listInvitations,
  sendFamilyInvitations:vi.fn(),
  retryFamilyInvitationBatch:vi.fn(),
}));
vi.mock("@/modules/programs/site-marketing-packages-v61.functions",()=>({
  listSiteMarketingPackagesV61:calls.listPackages,
  readSiteMarketingSuggestionsV61:calls.suggestions,
}));

import { Route } from "@/routes/admissions.invite-families";
import { introduceModuleConfigV61 } from "@/domain/launch-introduce-v61";

const siteA="11111111-1111-4111-8111-111111111111";
const siteB="22222222-2222-4222-8222-222222222222";
const packageId="33333333-3333-4333-8333-333333333333";
const program="44444444-4444-4444-8444-444444444444";
const packageRecord=(options:{
  siteId?:string;purpose?:string;status?:string;headline?:string;message?:string;
}={})=>({
  id:packageId,siteId:options.siteId??siteA,status:options.status??"draft",
  content:{purpose:options.purpose??"interest-invitation",
    headline:options.headline??"Explore our learning community",
    message:options.message??"We would love to hear what matters to our neighbors."},
});
const loader=async(deps:{
  siteId?:string;purpose:"interest"|"application";packageId?:string;
})=>{
  const route=Route as unknown as {
    options:{loader:(args:{deps:typeof deps})=>Promise<{
      ok:boolean;data?:{
        packageStarter:{headline:string;message:string}|null;
        suggestions:unknown;
      };
    }>}
  };
  return route.options.loader({deps});
};

beforeEach(()=>{
  vi.clearAllMocks();
  calls.listInvitations.mockResolvedValue({
    programs:[{id:program,siteId:siteA,purpose:"interest"}],batches:[],
  });
  calls.listPackages.mockResolvedValue([packageRecord()]);
  calls.suggestions.mockResolvedValue({
    "interest-invitation":{content:{
      headline:"A suggestion from saved Story",message:"A community is forming.",
    }},
  });
});

describe("Recruit from one saved Marketing Package and existing family invitation service",()=>{
  it("keeps a canonical Site/Package reference in the handoff",()=>{
    expect(introduceModuleConfigV61.recruit.packageHandoff?.href(siteA,packageId))
      .toBe("/admissions/invite-families?siteId="+siteA+
        "&purpose=interest&packageId="+packageId);
  });

  it("prefills editable subject and introduction without copying recipients",async()=>{
    const result=await loader({siteId:siteA,purpose:"interest",packageId});
    expect(result.ok).toBe(true);
    expect(result.data?.packageStarter).toEqual({
      headline:"Explore our learning community",
      message:"We would love to hear what matters to our neighbors.",
    });
    expect(calls.listPackages).toHaveBeenCalledWith({data:{siteId:siteA}});
    expect(calls.suggestions).not.toHaveBeenCalled();
  });

  it("rejects using a package with application purpose or without an exact Site",async()=>{
    expect((await loader({siteId:siteA,purpose:"application",packageId})).ok).toBe(false);
    expect((await loader({purpose:"interest",packageId})).ok).toBe(false);
    expect(calls.listPackages).not.toHaveBeenCalled();
  });

  it("rejects archived, unrelated-Site and wrong-purpose packages",async()=>{
    for(const wrong of [
      packageRecord({status:"archived"}),
      packageRecord({siteId:siteB}),
      packageRecord({purpose:"event-invitation"}),
    ]){
      calls.listPackages.mockResolvedValue([wrong]);
      const result=await loader({siteId:siteA,purpose:"interest",packageId});
      expect(result.ok).toBe(false);
    }
    expect(calls.suggestions).not.toHaveBeenCalled();
  });

  it("does not select an unrelated Site's only eligible Program",async()=>{
    calls.listInvitations.mockResolvedValue({
      programs:[{id:program,siteId:siteB,purpose:"interest"}],batches:[],
    });
    expect((await loader({siteId:siteA,purpose:"interest",packageId})).ok).toBe(false);
    expect(calls.listPackages).not.toHaveBeenCalled();
  });

  it("checks protected claims before trimming an email subject to 120 characters",async()=>{
    calls.listPackages.mockResolvedValue([packageRecord({
      headline:"A".repeat(135)+" accredited",message:"Welcome.",
    })]);
    expect((await loader({siteId:siteA,purpose:"interest",packageId})).ok).toBe(false);
    calls.listPackages.mockResolvedValue([packageRecord({
      headline:"Community ".repeat(14),message:"Welcome.",
    })]);
    const result=await loader({siteId:siteA,purpose:"interest",packageId});
    expect(result.ok).toBe(true);
    expect(result.data?.packageStarter?.headline.length).toBe(120);
  });

  it("still offers the canonical Story/Programs suggestion when no package is selected",async()=>{
    const result=await loader({siteId:siteA,purpose:"interest"});
    expect(result.ok).toBe(true);
    expect(result.data?.packageStarter).toBeNull();
    expect(calls.suggestions).toHaveBeenCalledWith({data:{siteId:siteA}});
  });
});
