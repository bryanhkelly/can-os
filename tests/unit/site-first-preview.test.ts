import { describe, expect, it } from "vitest";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { resolveSiteContentBlocks, defaultSiteContentChannelConfig } from "@/domain/site-content-channels";
import { siteTemplateIds } from "@/domain/site-theme";
import { siteFirstPreviewHeaders } from "@/domain/site-first-preview";

const base = (templateId: typeof siteTemplateIds[number]) => ({
  host: "example.can-os.com",
  site: {name: "Example Learning Center", organizationName: "Community Organization"},
  offerings: [],
  localContent: {...emptySiteLocalContent, heroHeadline: "A place to learn.",
    localDescription: "Learning plans are taking shape.",
    branding: {...emptySiteLocalContent.branding, templateId}},
});

describe("Private Site preview pulls data channels through the actual template", () => {
  const channels = resolveSiteContentBlocks(defaultSiteContentChannelConfig, {
    mode: "private", preferences: {
      delivery: "both", interestIds: ["afterschool", "adult", "grades-6-8"],
    },
  });

  it("composes proposed program cards on all seven templates, never as an injected overlay", () => {
    for (const templateId of siteTemplateIds) {
      const site = base(templateId);
      const html = renderPublicSiteHtml({...site, contentBlocks: channels}, {localPreview: true});
      expect(html).toContain('data-content-channel="learning.interests"');
      expect(html).toContain("Afterschool");
      expect(html).toContain("Adult Learning");
      expect(html).toContain("Grades 6–8");
      expect(html).toContain("Proposed · not enrolling");
      expect(html).not.toContain("can-launch-section");
      expect(html).not.toContain("can-launch-interest");
      expect(html).not.toContain("<form");
      expect(renderPublicSiteHtml(site, {localPreview: true}))
        .not.toContain('data-content-channel="learning.interests"');
    }
  });

  it("renders all of the Site Setup choices inside every template's native layout",()=>{
    const chosen=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",preferences:{delivery:"digital",interestIds:["summer"]},
      siteSetup:{name:"Valor School",organizationName:"Example Church",
        city:"Brentwood",state:"CA",timezone:"America/Los_Angeles"},
      networkStatusKnown:true,networkAffiliations:[{name:"COGIC",status:"pending"}],
    });
    for(const templateId of siteTemplateIds){
      const html=renderPublicSiteHtml({...base(templateId),contentBlocks:chosen},{localPreview:true});
      for(const field of ["Valor School","Example Church","Brentwood, CA",
        "America/Los_Angeles","Digital / online","COGIC","Summer &amp; Breaks"])
        expect(html,templateId+" missing "+field).toContain(field);
      for(const channel of ["site.setup","site.network","learning.interests"])
        expect(html).toContain('data-content-channel="'+channel+'"');
    }
  });
  it("renders approved Class links on every template without claiming enrollment is open", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const classBlock=defaultSiteContentChannelConfig.blocks.find(block=>block.channel==="learning.classes")!;
    const blocks=resolveSiteContentBlocks({
      version:2,revision:1,blocks:[classBlock],
    },{
      mode:"public",enrollmentOrigin:"https://app.example.org",
      classes:[{classId:id,title:"AI Skills Workshop",deliveryMode:"facilitated",nextStartsAt:null}],
    });
    expect(blocks[0]?.items[0]?.link?.href).toBe(
      "https://app.example.org/class?classId="+id,
    );
    for(const templateId of siteTemplateIds) {
      const html=renderPublicSiteHtml({...base(templateId),contentBlocks:blocks});
      expect(html).toContain("https://app.example.org/class?classId="+id);
      expect(html).toContain("View this Class");
      expect(html).not.toContain("Enroll in Class");
    }
  });

  it("never promises Program or Course enrollment without a verified action across the seven templates",()=>{
    const release="11111111-1111-4111-8111-111111111111";
    const season="22222222-2222-4222-8222-222222222222";
    const blocks=[
      {id:"programs",channel:"learning.enrichment" as const,
       placement:"learning" as const,layout:"cards" as const,enabled:true,
       eyebrow:"Programs",title:"Community Programs",description:""},
      {id:"courses",channel:"learning.noncredit" as const,
       placement:"learning" as const,layout:"cards" as const,enabled:true,
       eyebrow:"Courses",title:"Independent Courses",description:""},
    ];
    const feeds={
      mode:"public" as const,
      enrichment:[{seasonId:season,title:"Summer Lab",programName:"Community",registrationOpen:true}],
      noncredit:[{releaseId:release,title:"Digital Skills",siteName:"Learning Center",
        seatsRemaining:8,waitlistAvailable:false}],
    };
    const config={version:2 as const,revision:1,blocks};
    const withoutActions=resolveSiteContentBlocks(config,feeds);
    const withActions=resolveSiteContentBlocks(config,{
      ...feeds,enrollmentOrigin:"https://app.example.org",
    });
    for(const templateId of siteTemplateIds){
      const site=base(templateId);
      const privateState=renderPublicSiteHtml({...site,contentBlocks:withoutActions});
      expect(privateState).toContain("Program information only");
      expect(privateState).toContain("Enrollment information only");
      expect(privateState).not.toContain("/learn/enroll?release=");
      expect(privateState).not.toContain("/enrichment/"+season);
      const publicState=renderPublicSiteHtml({...site,contentBlocks:withActions});
      expect(publicState).toContain("Published program · enrollment available");
      expect(publicState).toContain("Enrollment available");
      expect(publicState).toContain("https://app.example.org/enrichment/"+season);
      expect(publicState).toContain("https://app.example.org/learn/enroll?release="+release);
    }
  });

  it("keeps a dark modern theme for programs instead of a mismatched white insert", () => {
    const html = renderPublicSiteHtml({...base("modern"), contentBlocks: channels}, {localPreview: true});
    expect(html).toContain("body.template-modern .site-content-block .site-channel-card");
    expect(html).toContain("background:#142b44");
    expect(html).toContain("var(--site-display)");
  });

  it("cannot publish private proposed channel content", () => {
    const published = resolveSiteContentBlocks(defaultSiteContentChannelConfig, {
      mode: "public", preferences: {delivery: "both", interestIds: ["adult"]},
    });
    const html = renderPublicSiteHtml({...base("modern"), contentBlocks: published});
    expect(html).not.toContain("Programs you are exploring");
    expect(html).not.toContain("Proposed · not enrolling");
  });

  it("retains the restricted private preview response policy", () => {
    expect(siteFirstPreviewHeaders["Cache-Control"]).toBe("private, no-store");
    expect(siteFirstPreviewHeaders["X-Robots-Tag"]).toBe("noindex, nofollow");
    expect(siteFirstPreviewHeaders["X-Frame-Options"]).toBe("SAMEORIGIN");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("frame-ancestors 'self'");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("default-src 'none'");
    expect(siteFirstPreviewHeaders["Content-Security-Policy"]).toContain("form-action 'none'");
  });
});
