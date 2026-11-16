import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { siteTemplateIds, resolveSiteTemplateId } from "@/domain/site-theme";
import { siteTemplateCatalog, composePublicSiteHome, composePublicSiteInterior, publicSiteTemplateCss, sevenSchoolCss, composePublicSiteChrome, composePublicSiteHero } from "@/domain/public-site-templates";
import { emptySiteLocalContent, normalizeSiteLocalContent } from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { publicSitePagePaths } from "@/domain/public-site-paths";
import { WebsiteTemplateGallery } from "@/components/launch-studio/WebsiteTemplateGallery";

describe("Website Studio seven-template contract", () => {
  it("lists seven different layout systems, each with a complete ordered composition", () => {
    expect(siteTemplateCatalog.map(item => item.id)).toEqual([...siteTemplateIds]);
    const sections={hero:"HERO",vision:"VISION",story:"STORY",explore:"EXPLORE",
      academics:"ACADEMICS",enrichment:"ENRICHMENT",closing:"CLOSING",contact:"CONTACT",
      channelsLearning:"__CHANNEL_LEARNING__",channelsCommunity:"__CHANNEL_COMMUNITY__",channelsClosing:"__CHANNEL_CLOSING__"};
    const layouts=siteTemplateIds.map(id=>composePublicSiteHome(id,sections));
    expect(new Set(layouts).size).toBe(7);
    for (const layout of layouts) for (const value of Object.values(sections))
      expect(layout.split(value).length-1).toBe(1);
    expect(layouts.every(value=>value.startsWith("HERO"))).toBe(true);
  });

  it("renders seven distinct homepage structures with responsive hero styles", () => {
    const sections={hero:"HERO",vision:"VISION",story:"STORY",explore:"EXPLORE",
      academics:"ACADEMICS",enrichment:"ENRICHMENT",closing:"CLOSING",contact:"CONTACT",
      channelsLearning:"__CHANNEL_LEARNING__",channelsCommunity:"__CHANNEL_COMMUNITY__",channelsClosing:"__CHANNEL_CLOSING__"};
    const interiors=siteTemplateIds.map(id=>composePublicSiteInterior(id,"HERO","PRIMARY","SECONDARY"));
    expect(new Set(interiors).size).toBe(7);
    for(const id of siteTemplateIds) {
      const classId=id==="bright-futures"?"bright":id;
      const composition=composePublicSiteHome(id,sections);
      expect(composition).toContain(`home-${classId}`);
      expect(sevenSchoolCss).toContain(`.public-hero.seven-hero-${id}`);
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

  it("uses seven different public shells without losing live links or school identity", () => {
    const shells=siteTemplateIds.map(template=>composePublicSiteChrome(template,{
      brand:"SCHOOL-BRAND-ONLY",monogram:"SB",navigation:'<a href="/about">About</a>',
      cta:'<a class="site-nav-cta" href="/contact">Contact</a>',
      mobile:'<details class="mobile-menu"><summary>Menu</summary></details>',
      main:'<main id="main-content">PAGE</main>',
      footer:'<footer>FOOT</footer>',
    }));
    expect(new Set(shells).size).toBe(7);
    for(const shell of shells) {
      expect(shell).toContain('<header');
      expect(shell).toContain('<nav class="desktop-nav"');
      expect(shell).toContain('<main id="main-content">PAGE</main>');
      expect(shell).toContain('href="/about"');
      expect(shell).toContain('href="/contact"');
      expect(shell).toContain('class="mobile-menu"');
      expect(shell.split('SCHOOL-BRAND-ONLY').length-1).toBe(1);
      expect(shell).toContain('>SB</span>');
    }
    const heroes=siteTemplateIds.map(template=>composePublicSiteHero(template,{
      kicker:"EYEBROW",title:"HEADLINE",subtitle:"SUBTITLE",
      intro:"SUMMARY",actions:"ACTIONS",image:"",
    }));
    expect(new Set(heroes).size).toBe(7);
    for(const hero of heroes) {
      expect(hero).toContain('id="welcome"');
      expect(hero).toContain("<h1>HEADLINE</h1>");
      expect(hero.split("<h1>").length-1).toBe(1);
      expect(hero).toContain("ACTIONS");
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

  it("renders all 91 public design/pages from canonical approved data without scripts", () => {
    const example = {
      host: "fictional.can-os.com",
      site: {name:"Sample School",organizationName:"Sample Community"},
      demonstration:true,
      offerings:[],
      academicPrograms:[{
        programId:"sample-approved",title:"Example learning",
        summary:"A fictional program for template quality assurance.",
        typeLabel:"School program",grades:{min:"6",max:"12"},
        delivery:{onsite:true,asynchronous:true,liveOnline:false,onsiteDaysPerWeek:3},
        availability:"planned" as const,applicationOpen:false,
      }],
    };
    for(const templateId of siteTemplateIds) {
      const localContent={...emptySiteLocalContent,
        schoolVision:"Families helping young people learn and grow.",
        churchHistory:"An illustrative school for template testing.",
        localDescription:"A fictional school community.",
        branding:{...emptySiteLocalContent.branding,templateId},
      };
      for(const path of publicSitePagePaths) {
        const html=renderPublicSiteHtml({...example,localContent},{path});
        expect(html, `${templateId} ${path}`).toContain(`template-${templateId}`);
        expect(html).toContain('<main id="main-content">');
        expect(html).toContain('class="desktop-nav"');
        expect(html).toContain('class="mobile-menu"');
        expect((html.match(/<h1[ >]/g)??[]).length).toBe(1);
        expect(html).toContain('content="noindex,nofollow"');
        expect(html).not.toContain("<script");
        expect(html).not.toContain("@import");
      }
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

  it("uses semantic choices for all seven templates and ten previewable pages",()=>{
    const html=renderToStaticMarkup(<WebsiteTemplateGallery schoolName="Sample Academy" value="heritage"
      onChange={()=>{}}/>);
    expect((html.match(/aria-pressed=/g)??[]).length).toBe(9);
    expect(html).toContain("Heritage Academy");
    expect(html).toContain("Community &amp; Faith");
    expect(html).toContain("Modern Learning");
    expect(html).toContain("Bright Futures");
    expect(html).toContain("Summit Preparatory");
    expect(html).toContain("Heritage Classical");
    expect(html).toContain("Campus Life");
    expect((html.match(/<option/g)??[]).length).toBe(10);
    expect(html).toContain('aria-label="School website templates"');
    expect((html.match(/Larger preview of/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });
});
