import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { siteTemplateIds } from "@/domain/site-theme";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import {
  resolveSchoolBrand, renderSchoolBrandSvg, schoolBrandMonogram,
  schoolBrandSvgDataUrl, schoolBrandDesigns,
} from "@/domain/school-brand-identity";
import { SchoolBrandPreview } from "@/components/launch-studio/SchoolBrandPreview";
import { renderPublicSiteHtml } from "@/domain/public-site-html";

describe("Website & Brand Studio", () => {
  it("defines seven design-specific school identities, without extra template choices", () => {
    expect(Object.keys(schoolBrandDesigns)).toEqual([...siteTemplateIds]);
    const svgs = siteTemplateIds.map(templateId =>
      renderSchoolBrandSvg("Barton Academy", {
        ...emptySiteLocalContent.branding, templateId,
      }));
    expect(new Set(svgs).size).toBe(7);
    for (const svg of svgs) {
      expect(svg).toContain('aria-label="Barton Academy brand wordmark"');
      expect(svg).toContain(">BA</text>");
      expect(svg).not.toContain("<script");
      expect(svg).not.toContain("@import");
      expect(svg).not.toContain("https://");
    }
  });

  it("keeps Site-specific names while producing safe SVG even for malicious text", () => {
    expect(schoolBrandMonogram("Barton Academy")).toBe("BA");
    expect(schoolBrandMonogram("Oakland")).toBe("OA");
    expect(schoolBrandMonogram("  ")).toBe("S");
    const unsafe = `Bay <script>alert("x")</script> & Academy`;
    const svg = renderSchoolBrandSvg(unsafe, emptySiteLocalContent.branding);
    expect(svg).not.toContain("<script");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    const url = schoolBrandSvgDataUrl(unsafe, emptySiteLocalContent.branding);
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",")[1]!)).toBe(svg);
  });

  it("accepts only curated palette and typography tokens", () => {
    const visual = resolveSchoolBrand("Barton Academy", {
      ...emptySiteLocalContent.branding,
      templateId: "modern", paletteId: "coastal", typographyId: "contemporary",
    });
    expect(visual.design.name).toBe("Modern Learning");
    expect(visual.theme.paletteId).toBe("coastal");
    expect(visual.theme.typographyId).toBe("contemporary");
    expect(visual.monogram).toBe("BA");
  });

  it("previews and exports the school-specific brand without publishing or sending", () => {
    const html = renderToStaticMarkup(<SchoolBrandPreview
      schoolName="Barton Academy"
      branding={{...emptySiteLocalContent.branding, templateId:"community"}}/>);
    expect(html).toContain("Barton Academy");
    expect(html).toContain("Community &amp; Faith");
    expect(html).toContain("Download SVG wordmark");
    expect(html).toContain("barton-academy-wordmark.svg");
    expect(html).toContain("Email header concept");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<script");
  });

  it("renders that same unique school mark in every hosted website header", () => {
    for (const templateId of siteTemplateIds) {
      const html = renderPublicSiteHtml({
        host:"fictional.can-os.com",
        site:{name:"Barton Academy",organizationName:"Illustrative Community"},
        demonstration:true, offerings:[],
        localContent:{...emptySiteLocalContent,
          branding:{...emptySiteLocalContent.branding,templateId}},
      });
      expect(html).toContain(">BA</span>");
      expect(html).toContain("Barton Academy");
      expect((html.match(/<h1[ >]/g)??[]).length).toBe(1);
      expect(html).not.toContain("<script");
    }
  });
});
