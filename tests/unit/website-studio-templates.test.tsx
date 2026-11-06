import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { siteTemplateIds, resolveSiteTemplateId } from "@/domain/site-theme";
import { siteTemplateCatalog, composePublicSiteHome } from "@/domain/public-site-templates";
import { emptySiteLocalContent, normalizeSiteLocalContent } from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";

describe("Website Studio five-template contract", () => {
  it("lists five different layout systems, each with a complete ordered composition", () => {
    expect(siteTemplateCatalog.map(item => item.id)).toEqual([...siteTemplateIds]);
    const sections={hero:"HERO",vision:"VISION",story:"STORY",explore:"EXPLORE",
      academics:"ACADEMICS",enrichment:"ENRICHMENT",closing:"CLOSING",contact:"CONTACT"};
    const layouts=siteTemplateIds.map(id=>composePublicSiteHome(id,sections));
    expect(new Set(layouts).size).toBe(5);
    for (const layout of layouts) for (const value of Object.values(sections))
      expect(layout.split(value).length-1).toBe(1);
    expect(layouts.every(value=>value.startsWith("HERO"))).toBe(true);
  });

  it("versions template choice independently of palette and typography", () => {
    const original=normalizeSiteLocalContent({...emptySiteLocalContent,branding:{
      ...emptySiteLocalContent.branding,templateId:"summit",paletteId:"forest",typographyId:"contemporary",
    }});
    expect(original.branding.templateId).toBe("summit");
    expect(original.branding.paletteId).toBe("forest");
    expect(original.branding.typographyId).toBe("contemporary");
    const switched=normalizeSiteLocalContent({...original,branding:{...original.branding,templateId:"modern"}});
    expect(switched.branding.paletteId).toBe(original.branding.paletteId);
    expect(switched.welcomeMessage).toBe(original.welcomeMessage);
    expect(resolveSiteTemplateId("unknown")).toBe("heritage");
    expect(()=>normalizeSiteLocalContent({...original,branding:{
      ...original.branding,templateId:"<script>" as never,
    }})).toThrow(/approved school visual identity/);
  });

  it("renders structural class and approved content with no untrusted scripts or external assets", () => {
    for (const templateId of siteTemplateIds) {
      const page={host:"fictional.can-os.com",site:{name:"Example Academy",organizationName:"Example Church"},
        offerings:[],demonstration:true,localContent:{
          ...emptySiteLocalContent,welcomeMessage:"Welcome to our school",
          schoolVision:"Learn, serve and grow.",
          branding:{...emptySiteLocalContent.branding,templateId},
        }};
      const html=renderPublicSiteHtml(page);
      const main=html.split('<main id="main-content">')[1] ?? "";
      expect(html).toContain(`template-${templateId}`);
      expect(main).toContain("Example Academy");
      expect(main).toContain("Learn, serve and grow.");
      expect(html).toContain('content="noindex,nofollow"');
      expect(html).not.toContain("<script");
      expect(html).not.toContain("@import");
      expect(html).not.toContain("<link rel=\"stylesheet\"");
    }
  });

  it("uses semantic, accessible buttons and exactly one choice per template",()=>{
    const html=renderToStaticMarkup(<WebsiteTemplateGallery schoolName="Sample Academy" value="heritage"
      onChange={()=>{}}/>);
    expect((html.match(/aria-pressed=/g)??[]).length).toBe(7);
    expect(html).toContain("Heritage Academy");
    expect(html).toContain("Community &amp; Faith");
    expect(html).toContain("Modern Academy");
    expect(html).toContain("Bright Futures");
    expect(html).toContain("Summit Preparatory");
    expect(html).toContain('aria-label="School website templates"');
  });
});
