import { describe,expect,it } from "vitest";
import { contrastRatio, resolveSiteTheme, reviewSuggestedChurchPalette,
  sitePaletteIds,siteTypographyIds } from "@/domain/site-theme";
import { emptySiteLocalContent, normalizeSiteLocalContent } from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

describe("PX-B curated visual identities",()=>{
  it("validates readable foregrounds for every palette and font pairing",()=>{
    for(const palette of sitePaletteIds)for(const typography of siteTypographyIds){
      const t=resolveSiteTheme(palette,typography);
      expect(t.paletteId).toBe(palette);
      expect(t.typographyId).toBe(typography);
      expect(contrastRatio(t.ink,t.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted,t.canvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio("#ffffff",t.ink)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("fails safely to CAN Signature when theme IDs are unknown",()=>{
    expect(resolveSiteTheme("inject:url(https://bad)","A")).toEqual(resolveSiteTheme());
    expect(()=>normalizeSiteLocalContent({...emptySiteLocalContent,
      branding:{theme:"classic",paletteId:"injection" as never,heroImage:null}})).toThrow();
  });
  it("renders the selected reviewed palette without remote CSS or font assets",()=>{
    const page={host:"fixture.can-os.com",site:{name:"Fictional Academy",
      organizationName:"Example Church"},offerings:[],
      localContent:{...emptySiteLocalContent,branding:{
        theme:"classic" as const,paletteId:"coastal" as const,
        typographyId:"contemporary" as const,heroImage:null}}};
    const html=renderPublicSiteHtml(page);
    expect(html).toContain("--site-ink:#174153");
    expect(html).toContain("--site-display:'Trebuchet MS'");
    expect(html).toContain('class="mobile-menu"');
    expect(html).toContain('href="#main-content"');
    expect(html).not.toContain("@import");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<link rel=\"stylesheet\"");
  });
  it("labels unverified scraped colors and fonts as proposals, never active CSS",()=>{
    expect(reviewSuggestedChurchPalette(null).state).toBe("unavailable");
    const review=reviewSuggestedChurchPalette({
      siteId:"site",sourceUrl:"https://example.test",analyzedAt:"2026-11-03",
      paletteSuggestions:[
        {hex:"#112d34",roleSuggestion:"primary",sourceEvidence:"header CSS"},
        {hex:"#ffffff",roleSuggestion:"accent",sourceEvidence:"background CSS"},
        {hex:"url(javascript:alert(1))",roleSuggestion:"accent",sourceEvidence:"unsafe"},
      ],
      headingFontSuggestion:{familyName:"UnlicensedBrandFace",sourceEvidence:"heading declaration"},
      status:"suggested",
    });
    expect(review.state).toBe("suggested");
    if(review.state==="suggested"){
      expect(review.candidates).toHaveLength(2);
      expect(review.candidates[0]?.usableForBody).toBe(true);
      expect(review.candidates[1]?.usableForBody).toBe(false);
      expect(review.headingFontSuggestion).toBe("UnlicensedBrandFace");
    }
    expect(resolveSiteTheme().displayFont).not.toContain("UnlicensedBrandFace");
  });
});
