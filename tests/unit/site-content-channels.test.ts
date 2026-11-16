import { describe, expect, it } from "vitest";
import {
  defaultSiteContentChannelConfig, readSiteContentChannelConfig,
  resolveSiteContentBlocks, siteContentChannelConfigSchema,
  siteContentChannelDescriptions,
} from "@/domain/site-content-channels";

const proposed = {delivery: "both" as const, interestIds: ["afterschool", "adult"] as const};

describe("Site-owned website content channels", () => {
  it("resolves private planning intent from the Site channel rather than page HTML", () => {
    const config = readSiteContentChannelConfig(undefined);
    const privateBlocks = resolveSiteContentBlocks(config, {
      mode: "private", preferences: {delivery: proposed.delivery, interestIds: [...proposed.interestIds]},
    });
    expect(privateBlocks).toHaveLength(1); // Setup has no supplied Site identity; only interests render.
    expect(privateBlocks[0]!.items.map(item => item.title))
      .toEqual(["Afterschool", "Adult Learning"]);
    expect(privateBlocks[0]!.items.every(item => !item.link)).toBe(true);
    expect(resolveSiteContentBlocks(config, {
      mode: "public", preferences: {delivery: proposed.delivery, interestIds: [...proposed.interestIds]},
    })).toEqual([]);
  });

  it("upgrades V1 Site settings without erasing the operator's existing block choices", () => {
    const previous={version:1,revision:7,blocks:[
      {...defaultSiteContentChannelConfig.blocks.find(block=>block.channel==="learning.interests")!,
        title:"My selected interests"},
    ]};
    const migrated=readSiteContentChannelConfig(previous);
    expect(migrated.version).toBe(2);
    expect(migrated.revision).toBe(7);
    expect(migrated.blocks[0]?.title).toBe("My selected interests");
    expect(migrated.blocks.some(block=>block.channel==="site.setup")).toBe(true);
    expect(migrated.blocks.some(block=>block.channel==="site.network")).toBe(true);
    expect(readSiteContentChannelConfig(migrated)).toEqual(migrated);
  });
  it("the private preview has a home for every saved Site Setup fact",()=>{
    const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",siteSetup:{name:"Valor School",organizationName:"Example Church",
        city:"Brentwood",state:"CA",timezone:"America/Los_Angeles"},
      preferences:{delivery:"both",interestIds:["afterschool","grades-9-12"]},
      networkStatusKnown:true,networkAffiliations:[
        {name:"Example network",status:"pending"},
      ],
    });
    const setup=blocks.find(block=>block.channel==="site.setup");
    expect(setup?.items.map(item=>item.id)).toEqual([
      "site-name","responsible-organization","planning-location","site-timezone","delivery-intent",
    ]);
    expect(setup?.items.find(item=>item.id==="planning-location")?.description).toBe("Brentwood, CA");
    expect(setup?.items.find(item=>item.id==="delivery-intent")?.description).toBe("Physical and digital");
    expect(blocks.find(block=>block.channel==="site.network")?.items[0]?.label).toBe("Affiliation: pending");
    expect(blocks.find(block=>block.channel==="learning.interests")?.items).toHaveLength(2);
    const published=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"public",preferences:{delivery:"both",interestIds:["afterschool"]},
      siteSetup:{name:"Valor School",organizationName:"Example Church",
        city:"Brentwood",state:"CA",timezone:"America/Los_Angeles"},
      networkStatusKnown:true,networkAffiliations:[{name:"Example network",status:"approved"}],
    });
    expect(published.some(block=>["site.setup","site.network","learning.interests"].includes(block.channel)))
      .toBe(false);
  });
  it("rejects duplicate feeds and unapproved institutional copy", () => {
    const block = defaultSiteContentChannelConfig.blocks[0]!;
    expect(() => siteContentChannelConfigSchema.parse({
      version: 2, revision: 0, blocks: [block, {...block, id: "second"}],
    })).toThrow();
    expect(() => siteContentChannelConfigSchema.parse({
      version: 2, revision: 0, blocks: [{...block, title: "<script>bad</script>"}],
    })).toThrow();
    expect(() => siteContentChannelConfigSchema.parse({
      version: 2, revision: 0, blocks: [{...block, title: "Accredited school"}],
    })).toThrow();
  });

  it("derives reviewed academic blocks only from the supplied approved catalog", () => {
    const config = {version: 1 as const, revision: 1, blocks: [{
      id: "approved-academics", channel: "learning.academics" as const,
      placement: "learning" as const, layout: "list" as const,
      enabled: true, eyebrow: "Academics", title: "Learning here",
      description: "Programs offered through the Site",
    }]};
    const missing = resolveSiteContentBlocks(config, {mode: "public", academicPrograms: []});
    expect(missing).toEqual([]);
    const present = resolveSiteContentBlocks(config, {mode: "public", academicPrograms: [{
      programId: "approved-one", title: "Middle school", summary: "A reviewed Program",
      typeLabel: "School", grades: {min: "6", max: "8"},
      delivery: {onsite: true, asynchronous: false, liveOnline: false, onsiteDaysPerWeek: 5},
      availability: "planned",
    }]});
    expect(present).toHaveLength(1);
    expect(present[0]!.items[0]!.label).toContain("admissions not open");
  });

  it("private previews cannot enable registration links", () => {
    const config = {version: 1 as const, revision: 1, blocks: [{
      id: "training", channel: "learning.noncredit" as const,
      placement: "learning" as const, layout: "cards" as const,
      enabled: true, eyebrow: "Training", title: "Learn", description: "",
    }]};
    const blocks = resolveSiteContentBlocks(config, {mode: "private", noncredit: [{
      releaseId: "11111111-1111-4111-8111-111111111111",
      title: "AI training", siteName: "Example", seatsRemaining: 10, waitlistAvailable: false,
    }], enrollmentOrigin: "https://example.org"});
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.items[0]!.link).toBeUndefined();
  });

  it("noncredit registration links require an eligible release and trusted HTTPS origin", () => {
    const config = {version: 1 as const, revision: 1, blocks: [{
      id: "training", channel: "learning.noncredit" as const,
      placement: "learning" as const, layout: "cards" as const,
      enabled: true, eyebrow: "Training", title: "Learn", description: "",
    }]};
    const eligible = [{
      releaseId: "11111111-1111-4111-8111-111111111111", title: "AI training",
      siteName: "Example", seatsRemaining: 10, waitlistAvailable: false,
    }];
    expect(resolveSiteContentBlocks(config, {mode: "public", noncredit: eligible,
      enrollmentOrigin: "https://example.org"})[0]?.items[0]?.link?.href)
      .toContain("/learn/enroll?release=");
    expect(resolveSiteContentBlocks(config, {mode: "public", noncredit: eligible,
      enrollmentOrigin: "http://example.org"})[0]?.items[0]?.link).toBeUndefined();
    expect(siteContentChannelDescriptions["learning.noncredit"].privateOnly).toBe(false);
  });
});
