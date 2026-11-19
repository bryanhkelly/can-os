import { describe, expect, it } from "vitest";
import { siteBrandDirectionIds, recommendBrandDirection, brandRecommendedLayout, brandRecommendedPalette } from "./site-brand-direction";
import { emptySiteStoryV61 } from "./site-information-v61";
import { sitePaletteIds, siteTemplateIds } from "./site-theme";
import { createSchoolWebsiteStarterContent, normalizeSiteLocalContent } from "./site-local-content";
describe("Site website Brand Identity",()=>{
  it("offers six valid brand directions and curated recommendations",()=>{
    expect(siteBrandDirectionIds).toHaveLength(6);
    for(const id of siteBrandDirectionIds){
      expect(siteTemplateIds).toContain(brandRecommendedLayout(id));
      expect(sitePaletteIds).toContain(brandRecommendedPalette(id));
    }
  });
  it("does not manufacture a suggestion for a blank Story",()=>{
    expect(recommendBrandDirection(null)).toBeNull();
    expect(recommendBrandDirection(emptySiteStoryV61())).toBeNull();
  });
  it("retains a direction in the immutable website revision payload",()=>{
    const old=createSchoolWebsiteStarterContent("Test Site");
    const content=normalizeSiteLocalContent({...old,branding:{...old.branding,brandDirectionId:"creative"}});
    expect(content.branding.brandDirectionId).toBe("creative");
    expect(()=>normalizeSiteLocalContent({...old,branding:{...old.branding,
      brandDirectionId:"invalid" as "creative"}})).toThrow();
  });
});
