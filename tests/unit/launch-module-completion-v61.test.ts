import { describe, expect, it } from "vitest";
import {
  completedLaunchStageV61,launchModuleCompletionV61,
} from "@/domain/launch-module-completion-v61";
import type { LaunchOverviewEvidence } from "@/domain/launch-overview-v61";

const site={
  id:"f1000000-0000-4000-8000-000000000003",
  name:"Valor School",organizationId:"f1000000-0000-4000-8000-000000000002",
  slug:"valor-school",timezone:"America/Los_Angeles",
  siteIdentityRevision:"2026-11-20T00:00:00.000Z",
  websiteDraft:{status:"draft" as const},
};
const complete:LaunchOverviewEvidence={
  information:{state:"ready",value:{hostingSaved:true,environmentSaved:true}},
  programs:{state:"ready",value:{saved:true}},
  brand:{state:"ready",value:{saved:true}},
  marketing:{state:"ready",value:{hasPackages:true}},
  solutions:{state:"ready",value:{plans:[{configurationId:"p",lifecycle:"frozen"}]}},
  websiteDraftAvailable:true,websiteContentSaved:true,
};

describe("saved Site module green checks",()=>{
  it("marks only independently verifiable saved planning modules",()=>{
    const result=launchModuleCompletionV61(site,complete);
    for(const id of ["site-profile","site-information","programs-audiences","website-brand"])
      expect(result[id as keyof typeof result]).toBe("complete");
    expect(result["publish-site"]).toBe("incomplete");
    expect(result["create-outreach"]).toBeUndefined();
    expect(result["program-catalog"]).toBeUndefined();
    expect(result["opening-compliance"]).toBeUndefined();
    expect(result.open).toBeUndefined();
    expect(completedLaunchStageV61("Shape",result)).toBe(true);
    expect(completedLaunchStageV61("Share",result)).toBe(false);
    expect(completedLaunchStageV61("Prepare",result)).toBe(false);
    expect(completedLaunchStageV61("Launch",result)).toBe(false);
  });
  it("does not award a green check to missing, failed or incomplete records",()=>{
    const evidence:LaunchOverviewEvidence={
      ...complete,
      information:{state:"unavailable"},
      programs:{state:"ready",value:{saved:false}},
      brand:{state:"ready",value:{saved:true}},
      websiteDraftAvailable:false,
    };
    const result=launchModuleCompletionV61({...site,siteIdentityRevision:null},evidence);
    // Existing Sites remain a saved Site Profile even when they predate the
    // optional v6.1 identity-revision metadata.
    expect(result["site-profile"]).toBe("complete");
    expect(result["site-information"]).toBe("unavailable");
    expect(result["programs-audiences"]).toBe("incomplete");
    expect(result["website-brand"]).toBe("incomplete");
    expect(completedLaunchStageV61("Shape",result)).toBe(false);
  });
  it("still requires actual saved identity fields, but not optional revision metadata",()=>{
    const result=launchModuleCompletionV61({...site,name:"",siteIdentityRevision:null},complete);
    expect(result["site-profile"]).toBe("incomplete");
    expect(launchModuleCompletionV61({...site,siteIdentityRevision:null},complete)["site-profile"])
      .toBe("complete");
  });
  it("requires an actual saved website copy revision for Website & Brand completion",()=>{
    const result=launchModuleCompletionV61(site,{
      ...complete,websiteContentSaved:false,
    });
    expect(result["website-brand"]).toBe("incomplete");
  });
  it("checks website publishing only when the Site really has published it",()=>{
    expect(launchModuleCompletionV61({
      ...site,websiteDraft:{status:"published"},
    },complete)["publish-site"]).toBe("complete");
  });
});
