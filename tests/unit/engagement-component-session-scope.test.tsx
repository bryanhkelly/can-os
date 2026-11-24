import { describe, expect, it } from "vitest";
import { GoLinkWorkspace } from "@/components/launch-studio/GoLinkWorkspace";
import { SiteEngagementLibrary } from "@/components/launch-studio/SiteEngagementLibrary";
import { NativeEngagementCampaigns } from "@/components/launch-studio/NativeEngagementCampaigns";
import { CampaignListMembers } from "@/components/launch-studio/CampaignListMembers";

describe("Engagement component session isolation", () => {
  it("preserves a Go Link editor only for the same Site and package", () => {
    const initial = GoLinkWorkspace({siteId:"site-a",packageId:"package-a"});
    expect(GoLinkWorkspace({siteId:"site-a",packageId:"package-a"}).key).toBe(initial.key);
    expect(GoLinkWorkspace({siteId:"site-b",packageId:"package-a"}).key).not.toBe(initial.key);
    expect(GoLinkWorkspace({siteId:"site-a",packageId:"package-b"}).key).not.toBe(initial.key);
  });
  it("separates Site, platform and Organization engagement libraries", () => {
    const local = SiteEngagementLibrary({siteId:"site-a",packageId:"package-a"});
    const platform = SiteEngagementLibrary({ownerSurface:{owner:{kind:"platform"},sites:[]}});
    const org = (organizationId:string) => SiteEngagementLibrary({ownerSurface:{owner:{kind:"organization",organizationId},sites:[]}});
    expect(SiteEngagementLibrary({siteId:"site-a",packageId:"package-a"}).key).toBe(local.key);
    expect(new Set([local.key,platform.key,org("org-a").key,org("org-b").key]).size).toBe(4);
  });
  it("never reuses campaign draft, consent or request state for another engagement or link", () => {
    const props={engagementId:"engagement-a",linkId:"link-a",invitationReady:true};
    const initial=NativeEngagementCampaigns(props);
    expect(NativeEngagementCampaigns({...props,invitationReady:false}).key).toBe(initial.key);
    expect(NativeEngagementCampaigns({...props,linkId:"link-b"}).key).not.toBe(initial.key);
    expect(NativeEngagementCampaigns({...props,engagementId:"engagement-b"}).key).not.toBe(initial.key);
  });
  it("isolates recipient selection and confirmation by exact list and link", () => {
    const props={engagementId:"engagement-a",linkId:"link-a",listId:"list-a",onChange:()=>{}};
    const initial=CampaignListMembers(props);
    expect(CampaignListMembers({...props,onChange:()=>{}}).key).toBe(initial.key);
    expect(CampaignListMembers({...props,listId:"list-b"}).key).not.toBe(initial.key);
    expect(CampaignListMembers({...props,linkId:"link-b"}).key).not.toBe(initial.key);
  });
});
