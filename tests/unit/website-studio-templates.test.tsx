import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { siteTemplateIds, resolveSiteTemplateId } from "@/domain/site-theme";
import { siteTemplateCatalog, composePublicSiteHome, composePublicSiteInterior, publicSiteTemplateCss } from "@/domain/public-site-templates";
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

  it("renders five distinct homepage structures with responsive hero styles", () => {
    const sections={hero:"HERO",vision:"VISION",story:"STORY",explore:"EXPLORE",
      academics:"ACADEMICS",enrichment:"ENRICHMENT",closing:"CLOSING",contact:"CONTACT"};
    const interiors=siteTemplateIds.map(id=>composePublicSiteInterior(id,"HERO","PRIMARY","SECONDARY"));
    expect(new Set(interiors).size).toBe(5);
    for(const id of siteTemplateIds) {
      const classId=id==="bright-futures"?"bright":id;
      const composition=composePublicSiteHome(id,sections);
      expect(composition).toContain(`home-${classId}`);
      expect(publicSiteTemplateCss).toContain(`body.template-${id} .public-hero:not(.compact-hero)`);
      for(const text of Object.values(sections)) expect(composition.split(text).length-1).toBe(1);
      const page={host:"fictional.can-os.com",
        site:{name:"Sample Academy",organizationName:"Sample Partner"},
        offerings:[],demonstration:true,localContent:{
          ...emptySiteLocalContent,heroHeadline:"Explore learning",
          schoolVision:"Grow with purpose", localDescription:"A fictional school",
          branding:{...emptySiteLocalContent.branding,templateId:id},
        }};
      const html=renderPublicSiteHtml(page);
      expect(html).toContain(`template-${id}`);
      expect(html).toContain(`home-${classId}`);
      expect(html).toContain('id="welcome"');
      expect((html.match(/<h1>/g) ?? []).length).toBe(1);
    }
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

  it("honors an explicit heading font in Modern and uses only defined background tokens", () => {
    const html = renderPublicSiteHtml({
      host: "fictional.can-os.com",
      site: { name: "Example School", organizationName: "Example Church" },
      offerings: [], localContent: { ...emptySiteLocalContent, branding: {
        ...emptySiteLocalContent.branding, templateId: "modern",
        headingFontId: "palatino", bodyFontId: "verdana",
      } },
    });
    expect(html).toContain("--site-display:'Palatino Linotype'");
    expect(html).toContain("--site-body:Verdana");
    expect(html).toContain("body{font-family:var(--site-body);color:var(--site-ink);background:var(--site-paper);");
    expect(html).toContain("body.template-modern .brand{font:800 .86rem/1.3 var(--site-display)");
    expect(html).toContain("var(--site-display);letter-spacing:-.075em");
    expect(html).not.toContain("body.template-modern{--site-display:var(--site-body)");
    expect(html).not.toContain("var(--site-canvas");
  });

  it("keeps Modern Academy's sans-serif heading when no explicit font override exists", () => {
    const html = renderPublicSiteHtml({
      host: "fictional.can-os.com", site: { name: "Modern School", organizationName: "Church" },
      offerings: [], localContent: { ...emptySiteLocalContent, branding: {
        ...emptySiteLocalContent.branding, templateId: "modern",
      } },
    });
    expect(html).toContain("--site-display:Arial, Helvetica, sans-serif");
    expect(html).toContain("--site-body:Arial, Helvetica, sans-serif");
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
    expect((html.match(/Larger preview of/g) ?? []).length).toBeGreaterThanOrEqual(5);
  });
});
