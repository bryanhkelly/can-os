import { describe, expect, it } from "vitest";
import { engagementOwnerScopeKey } from "@/domain/engagement-owner-scope";
import { engagementChannels, engagementChannelSchema, engagementChannelLabels } from "@/domain/engagement-definition";
import { GoLinkWorkspace } from "@/components/launch-studio/GoLinkWorkspace";
import {legacyEngagementTransport,type EngagementWorkspaceTransport} from "@/modules/engagement/engagement-workspace-transport";
import {legacyGoLinkTransport,type GoLinkWorkspaceTransport} from "@/modules/engagement/go-link-workspace-transport";
import { UniversalEngagementPublisher } from "@/components/launch-studio/UniversalEngagementPublisher";
import { LaunchPreviewSharing } from "@/components/launch-studio/LaunchPreviewSharing";
import { SiteEngagementLibrary } from "@/components/launch-studio/SiteEngagementLibrary";
import { NativeEngagementCampaigns } from "@/components/launch-studio/NativeEngagementCampaigns";
import { CampaignListMembers } from "@/components/launch-studio/CampaignListMembers";
import { EngagementEmailDistribution } from "@/components/launch-studio/EngagementEmailDistribution";
import { legacyCampaignTransport } from "@/modules/communication/campaign-workspace-transport";
import type { CampaignTransport } from "@/domain/campaign-workspace-api";

describe("Engagement component session isolation", () => {
  it("preserves a Go Link editor only for the same Site and package", () => {
    const initial = GoLinkWorkspace({siteId:"site-a",packageId:"package-a"});
    expect(GoLinkWorkspace({siteId:"site-a",packageId:"package-a"}).key).toBe(initial.key);
    expect(GoLinkWorkspace({siteId:"site-b",packageId:"package-a"}).key).not.toBe(initial.key);
    expect(GoLinkWorkspace({siteId:"site-a",packageId:"package-b"}).key).not.toBe(initial.key);
  });
  it("isolates Go Link draft and pending issuance when the selected transport changes",()=>{
    const transport:GoLinkWorkspaceTransport={kind:"nest",api:legacyGoLinkTransport.api};
    const props={siteId:"site-a",packageId:"package-a"};
    expect(GoLinkWorkspace({...props,transport}).key).not.toBe(GoLinkWorkspace(props).key);
  });
  it("isolates publisher and library session keys when the selected transport changes",()=>{
    const transport:EngagementWorkspaceTransport={...legacyEngagementTransport,kind:"nest"};
    const props={siteId:"site-a",packageId:"package-a"};
    expect(UniversalEngagementPublisher({...props,transport}).key).not.toBe(UniversalEngagementPublisher(props).key);
    expect(SiteEngagementLibrary({...props,transport}).key).not.toBe(SiteEngagementLibrary(props).key);
  });
  it("separates Site, platform and Organization engagement libraries", () => {
    const local = SiteEngagementLibrary({siteId:"site-a",packageId:"package-a"});
    const platform = SiteEngagementLibrary({ownerSurface:{owner:{kind:"platform"},sites:[]}});
    const org = (organizationId:string) => SiteEngagementLibrary({ownerSurface:{owner:{kind:"organization",organizationId},sites:[]}});
    expect(SiteEngagementLibrary({siteId:"site-a",packageId:"package-a"}).key).toBe(local.key);
    expect(new Set([local.key,platform.key,org("org-a").key,org("org-b").key]).size).toBe(4);
  });
  it("shares the exact owner scope contract between publisher and library", () => {
    const scopes=[
      {siteId:"site-a",packageId:"package-a"},
      {siteId:"site-a",packageId:"package-b"},
      {siteId:"site-b",packageId:"package-a"},
      {ownerSurface:{owner:{kind:"platform" as const},sites:[]}},
      {ownerSurface:{owner:{kind:"organization" as const,organizationId:"org-a"},sites:[]}},
      {ownerSurface:{owner:{kind:"organization" as const,organizationId:"org-b"},sites:[]}},
    ];
    const keys=scopes.map(props=>UniversalEngagementPublisher(props).key);
    expect(new Set(keys).size).toBe(scopes.length);
    scopes.forEach((props,index)=>expect(SiteEngagementLibrary(props).key).toBe(keys[index]));
  });
  it("preserves explicit Site and Program owner identity", () => {
    const key=(kind:"site"|"program",id:string)=>engagementOwnerScopeKey(undefined,undefined,kind==="site"?{kind,siteId:id}:{kind,programId:id});
    expect(new Set([key("site","a"),key("site","b"),key("program","a"),key("program","b")]).size).toBe(4);
  });
  it("uses a single channel vocabulary for presentation and validation", () => {
    expect(Object.keys(engagementChannelLabels)).toEqual([...engagementChannels]);
    for(const channel of engagementChannels)expect(engagementChannelSchema.parse(channel)).toBe(channel);
    expect(engagementChannelSchema.safeParse("unsupported").success).toBe(false);
  });
  it("isolates preview shares, pending requests and created URLs by Site", () => {
    expect(LaunchPreviewSharing({siteId:"site-a"}).key).toBe(LaunchPreviewSharing({siteId:"site-a"}).key);
    expect(LaunchPreviewSharing({siteId:"site-b"}).key).not.toBe(LaunchPreviewSharing({siteId:"site-a"}).key);
  });
  it("never reuses campaign draft, consent or request state for another engagement or link", () => {
    const props={engagementId:"engagement-a",linkId:"link-a",invitationReady:true};
    const initial=NativeEngagementCampaigns(props);
    expect(NativeEngagementCampaigns({...props,invitationReady:false}).key).toBe(initial.key);
    expect(NativeEngagementCampaigns({...props,linkId:"link-b"}).key).not.toBe(initial.key);
    expect(NativeEngagementCampaigns({...props,engagementId:"engagement-b"}).key).not.toBe(initial.key);
  });
  it("starts a fresh workspace session when the explicitly selected transport changes", () => {
    const transport:CampaignTransport={kind:"nest",api:legacyCampaignTransport.api};
    const props={engagementId:"engagement-a",linkId:"link-a",invitationReady:true};
    expect(NativeEngagementCampaigns({...props,transport}).key).not.toBe(NativeEngagementCampaigns(props).key);
    const memberProps={...props,listId:"list-a",onChange:()=>{}};
    expect(CampaignListMembers({...memberProps,transport}).key).not.toBe(CampaignListMembers(memberProps).key);
    const distributionProps={...props,onClose:()=>{}};
    expect(EngagementEmailDistribution({...distributionProps,transport}).key).not.toBe(EngagementEmailDistribution(distributionProps).key);
  });
  it("isolates recipient selection and confirmation by exact list and link", () => {
    const props={engagementId:"engagement-a",linkId:"link-a",listId:"list-a",onChange:()=>{}};
    const initial=CampaignListMembers(props);
    expect(CampaignListMembers({...props,onChange:()=>{}}).key).toBe(initial.key);
    expect(CampaignListMembers({...props,listId:"list-b"}).key).not.toBe(initial.key);
    expect(CampaignListMembers({...props,linkId:"link-b"}).key).not.toBe(initial.key);
  });
});
