import {describe,expect,it} from "vitest";
import {launchSiteSelectionIssue} from "@/domain/launch-site-selection";

const sites=[{id:"campus-a"},{id:"campus-b"}];
const programs=[{id:"program-a",siteId:"campus-a"},{id:"program-b",siteId:"campus-b"}];

describe("explicit launch Site/Program routing",()=>{
  it("accepts a fresh setup without a forced campus",()=>{
    expect(launchSiteSelectionIssue({},sites,programs)).toBeNull();
  });
  it("recovers a Program-only route from the corresponding permitted Site",()=>{
    expect(launchSiteSelectionIssue({programId:"program-a"},sites,programs)).toBeNull();
    expect(launchSiteSelectionIssue({siteId:"campus-a",programId:"program-a"},sites,programs)).toBeNull();
  });
  it("never falls back to a sibling Site on stale or foreign links",()=>{
    expect(launchSiteSelectionIssue({siteId:"missing"},sites,programs)).toBe("site_unavailable");
    expect(launchSiteSelectionIssue({programId:"unavailable"},sites,programs)).toBe("program_unavailable");
    expect(launchSiteSelectionIssue({siteId:"campus-a",programId:"program-b"},sites,programs))
      .toBe("site_program_mismatch");
    expect(launchSiteSelectionIssue({programId:"program-a"},[sites[1]!],programs))
      .toBe("site_unavailable");
  });
});
