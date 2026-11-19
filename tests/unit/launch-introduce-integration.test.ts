import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  introduceModuleConfigV61, introduceModuleIdsV61, isIntroduceModuleV61,
} from "../../src/domain/launch-introduce-v61";
import { marketingPurposeIds } from "../../src/domain/marketing-package-v61";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("Launch Studio V6.1 Introduce integration", () => {
  it("owns all three experiences with one purpose-specific package source", () => {
    expect(introduceModuleIdsV61).toEqual(["promote", "recruit", "interest-events"]);
    for (const id of introduceModuleIdsV61) {
      expect(isIntroduceModuleV61(id)).toBe(true);
      const config = introduceModuleConfigV61[id];
      expect(marketingPurposeIds).toContain(config.defaultPurpose);
      expect(config.purposes).toContain(config.defaultPurpose);
      expect(config.purposes.length).toBeGreaterThan(0);
      for (const purpose of config.purposes) expect(marketingPurposeIds).toContain(purpose);
    }
    expect(isIntroduceModuleV61("open")).toBe(false);
    expect(isIntroduceModuleV61(undefined)).toBe(false);
  });

  it("uses Site Story and planned audiences in the existing authorized editorial projection", () => {
    const service = source("src/modules/programs/site-marketing-packages-v61.functions.ts");
    expect(service).toContain("siteStorySourceV61Schema.parse(source).answers");
    expect(service).toContain("readSiteProgramsAudiencesV61(plan)");
    expect(service).toContain("normalizeSiteLocalContent(savedWebsite.content");
    expect(service).toContain("suggestMarketingStarterV61(site.name");
    expect(service).toContain("assertSiteSetupScope");
    expect(source("src/components/launch-studio/MarketingPackagesV61.tsx"))
      .toContain("readSiteBrandVersionView");
  });

  it("loads the same Site-scoped packages and suggestions for all three modules", () => {
    const route = source("src/routes/launch.site.tsx");
    expect(route.match(/isIntroduceModuleV61\(deps\.module\)/g)).toHaveLength(2);
    expect(route).toContain("listSiteMarketingPackagesV61");
    expect(route).toContain("readSiteMarketingSuggestionsV61");
    expect(route).toContain("suggestionsUnavailable={!marketingSuggestions}");
    expect(route).not.toContain('deps.module === "promote"');
    expect(route).toContain('key={site.id + ":" + selected.id}');
  });

  it("filters the same immutable-Brand package library by context without introducing a new model", () => {
    const component = source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(component).toContain("context.purposes.includes(item.content.purpose)");
    expect(component).toContain("starter(context.defaultPurpose)");
    expect(component).toContain("context.handoffs.map");
    expect(component).toContain("setContent(workingDraft)");
    expect(component).toContain('brandReadiness==="missing"');
    expect(component).toContain("Open Website &amp; Brand");
    expect(component).toContain("createSiteMarketingRelease");
    expect(component).toContain("readSiteBrandVersionView");
    expect(component).not.toContain("localStorage");
  });

  it("hands off a saved event package without making it an event or another source of truth",()=>{
    const packages=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    const create=source("src/routes/operations.interest-events_.new.tsx");
    const workspace=source("src/routes/operations.interest-events.tsx");
    expect(packages).toContain("module===\"interest-events\"");
    expect(packages).toContain("packageId=\\${encodeURIComponent(record.id)}");
    expect(create).toContain("listSiteMarketingPackagesV61");
    expect(create).toContain("readSiteMarketingSuggestionsV61");
    expect(create).toContain('item.content.purpose==="event-invitation"');
    expect(create).toContain("containsProtectedInstitutionalClaim(savedHeadline)");
    expect(create).toContain("authorizedSite=deps.siteId");
    expect(workspace).toContain("suggestedTitle?.trim()");
    expect(workspace).toContain("titleSource===\"saved-package\"");
    expect(workspace).toContain("programId:selectedProgram.id");
    expect(workspace).toContain("setCreatedProgramId(selectedProgram.id)");
  });

  it("preserves distinct governed event and admissions workflows", () => {
    const siteId = "64af46d5-1fbb-4b12-ae27-56c31570e392";
    const recruit = introduceModuleConfigV61.recruit;
    const events = introduceModuleConfigV61["interest-events"];
    expect(recruit.defaultPurpose).toBe("interest-invitation");
    expect(events.purposes).toEqual(["event-invitation"]);
    expect(recruit.handoffs[0]?.href(siteId)).toBe(
      "/admissions/invite-families?siteId=" + siteId + "&purpose=interest",
    );
    expect(events.handoffs[0]?.href(siteId)).toBe(
      "/operations/interest-events?siteId=" + siteId,
    );
    expect(recruit.guidance).toContain("No contacts");
    expect(events.guidance).toContain("does not create an event");
    const invitations = source("src/routes/admissions.invite-families.tsx");
    expect(invitations).toContain('purpose: z.enum(["interest", "application"])');
    expect(invitations).toContain("readSiteMarketingSuggestionsV61");
    expect(invitations).toContain("program.siteId === selection.siteId");
    expect(invitations).toContain("purpose:selection.purpose");
    expect(invitations).toContain("confirmed:true");
    expect(source("src/modules/sites/site-family-brand.server.ts"))
      .toContain("readSavedBrandVersion(site.id)");
  });
});
