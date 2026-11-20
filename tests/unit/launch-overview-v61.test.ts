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
  it("does not treat a missing website draft as publication readiness", () => {
    expect(nextLaunchAction("site",{...complete,websiteDraftAvailable:false}).href)
      .toContain("module=website-brand");
  });
});
