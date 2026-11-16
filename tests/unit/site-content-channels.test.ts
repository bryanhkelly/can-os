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
    expect(privateBlocks).toHaveLength(1); // Noncredit feed is empty; only proposed programs render.
    expect(privateBlocks[0]!.items.map(item => item.title))
      .toEqual(["Afterschool", "Adult Learning"]);
    expect(privateBlocks[0]!.items.every(item => !item.link)).toBe(true);
    expect(resolveSiteContentBlocks(config, {
      mode: "public", preferences: {delivery: proposed.delivery, interestIds: [...proposed.interestIds]},
    })).toEqual([]);
  });

  it("rejects duplicate feeds and unapproved institutional copy", () => {
    const block = defaultSiteContentChannelConfig.blocks[0]!;
    expect(() => siteContentChannelConfigSchema.parse({
      version: 1, revision: 0, blocks: [block, {...block, id: "second"}],
    })).toThrow();
    expect(() => siteContentChannelConfigSchema.parse({
      version: 1, revision: 0, blocks: [{...block, title: "<script>bad</script>"}],
    })).toThrow();
    expect(() => siteContentChannelConfigSchema.parse({
      version: 1, revision: 0, blocks: [{...block, title: "Accredited school"}],
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
