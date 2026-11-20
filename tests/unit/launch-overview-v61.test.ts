import { describe, expect, it } from "vitest";
import { launchSiteLifecycleLabel, nextLaunchAction, type LaunchOverviewEvidence } from "@/domain/launch-overview-v61";

const ready = <T,>(value:T) => ({state:"ready" as const,value});
const complete:LaunchOverviewEvidence = {
  information: ready({hostingSaved:true,environmentSaved:true}),
  programs:ready({saved:true}),
  brand:ready({saved:true}),
  marketing:ready({hasPackages:true}),
  websiteDraftAvailable:true,
};

describe("Launch Overview source-derived next steps", () => {
  it("reflects stored canonical Site lifecycle without interpreting unknown as planning", () => {
    expect(launchSiteLifecycleLabel("planning")).toBe("Planning");
    expect(launchSiteLifecycleLabel("active")).toBe("Active Site");
    expect(launchSiteLifecycleLabel("closed")).toBe("Closed Site");
    expect(launchSiteLifecycleLabel(null)).toBe("Lifecycle not recorded");
  });
  it("resumes the first actual missing saved module", () => {
    const id="00000000-0000-4000-8000-000000000001";
    expect(nextLaunchAction(id,{...complete,information:ready({hostingSaved:false,environmentSaved:false})}).href)
      .toContain("module=site-information");
    expect(nextLaunchAction(id,{...complete,programs:ready({saved:false})}).href)
      .toContain("module=programs-audiences");
    expect(nextLaunchAction(id,{...complete,brand:ready({saved:false})}).href)
      .toContain("module=website-brand");
    expect(nextLaunchAction(id,{...complete,marketing:ready({hasPackages:false})}).href)
      .toContain("module=promote");
    expect(nextLaunchAction(id,complete).href).toContain("module=program-catalog");
  });
  it("keeps unavailable records distinct from never-saved records", () => {
    for(const section of ["information","programs","brand","marketing"] as const){
      const result=nextLaunchAction("site",{
        ...complete,[section]:{state:"unavailable" as const},
      });
      expect(result.description.toLowerCase()).toMatch(/verify|verified|unavailable/);
      expect(result.title).toMatch(/Review/);
    }
  });
  it("resumes a single saved Solution without mistaking a draft for approval", () => {
    const siteId = "00000000-0000-4000-8000-000000000001";
    const id = "00000000-0000-4000-8000-000000000012";
    const action = nextLaunchAction(siteId, {
      ...complete, solutions: ready({plans:[{configurationId:id,lifecycle:"draft"}]}),
    });
    expect(action.title).toBe("Continue Solution Plan");
    expect(action.href).toContain("module=program-catalog");
    expect(action.href).toContain("solutionPlanId="+id);
    expect(action.description).not.toMatch(/approved|authorized/i);
    const frozen = nextLaunchAction(siteId, {
      ...complete, solutions: ready({plans:[{configurationId:id,lifecycle:"frozen"}]}),
    });
    expect(frozen.title).toBe("Review Submitted Solution");
    expect(frozen.description).toContain("independent approval");
    expect(frozen.href).toContain("solutionPlanId="+id);
  });

  it("does not select an arbitrary plan when multiple exist or a read fails", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    const more = nextLaunchAction(id, {...complete, solutions: ready({plans:[
      {configurationId:"one",lifecycle:"draft"},
      {configurationId:"two",lifecycle:"frozen"},
    ]})});
    expect(more.title).toBe("Continue Preparing Solutions");
    expect(more.href).not.toContain("solutionPlanId");
    const unavailable = nextLaunchAction(id, {
      ...complete, solutions: {state:"unavailable"},
    });
    expect(unavailable.title).toBe("Review Program Catalog");
    expect(unavailable.description).toContain("could not be verified");
  });

  it("does not treat a missing website draft as publication readiness", () => {
    expect(nextLaunchAction("site",{...complete,websiteDraftAvailable:false}).href)
      .toContain("module=website-brand");
  });
});
