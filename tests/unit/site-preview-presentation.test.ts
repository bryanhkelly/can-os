import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import {
  previewSyntheticSiteContent, previewSyntheticSiteName,
} from "@/domain/site-preview-presentation";
import { renderPrivateWebsitePreviewHtml } from "@/domain/private-website-preview";
import { renderSharedSitePreview } from "@/domain/site-preview-sharing";
import {
  defaultSiteContentChannelConfig, resolveSiteContentBlocks, websitePreviewEditorialBlocks,
} from "@/domain/site-content-channels";

const siteId = "d8082b23-b28c-454d-a144-6860ef19d9ea";
const read=(path:string)=>readFileSync(path,"utf8");

describe("Barton demonstration website presentation", () => {
  it("uses normal Site identity in the preview but does not rewrite the real Site or Brand", () => {
    expect(previewSyntheticSiteName("Barton Demo School", true)).toBe("Barton School");
    expect(previewSyntheticSiteName("Barton Demo School", false)).toBe("Barton Demo School");
    expect(previewSyntheticSiteName("Demo", true)).toBe("Demo");
    const original={...emptySiteLocalContent,
      heroHeadline:"Barton Demo School welcomes you",
      localDescription:"At Barton Demo School, our community is growing.",
      schoolVision:"Our vision for Barton Demo School",
    };
    const preview=previewSyntheticSiteContent(original,"Barton School",["Barton Demo School"]);
    expect(preview.localDescription).toBe("At Barton School, our community is growing.");
    expect(preview.heroHeadline).toBe("Barton School welcomes you");
    expect(preview.schoolVision).toBe("Our vision for Barton School");
    expect(original.localDescription).toContain("Barton Demo School");
    expect(preview.branding).toBe(original.branding);
  });

  it("puts the only synthetic/preview designation in the top banner", () => {
    const html=renderPrivateWebsitePreviewHtml(
      '<html><head><title>Barton School</title></head><body><main><h1>Barton School</h1></main></body></html>',
      siteId,["/"],true,"site",true);
    expect(html).toContain("Demonstration website preview");
    expect(html).toContain("Images may be illustrative");
    expect(html).toContain("Forms disabled");
    expect(html.match(/Demonstration website preview/g)).toHaveLength(1);
    expect(html).not.toContain("Barton Demo School");
  });

  it("keeps the synthetic indicator in a shared link banner, not the Site identity", () => {
    const token="A".repeat(43);
    const source='<html><head><title>Barton School</title></head><body><h1>Barton School</h1></body></html>';
    const html=renderSharedSitePreview(source,siteId,token,["/"],true);
    expect(html).toContain("Demonstration website preview");
    expect(html).toContain("Barton School");
    expect(html).not.toContain("Barton Demo School");
    expect(html).toContain("Forms are disabled");
    expect(html).toContain('name="robots" content="noindex,nofollow"');
  });

  it("keeps production and preview access restrictions separate", () => {
    const preview=read("src/domain/private-website-preview.ts");
    const source=read("src/routes/launch.site-preview.ts");
    const share=read("src/modules/sites/site-preview-sharing.functions.ts");
    expect(preview).toContain('"Cache-Control": "private, no-store"');
    expect(preview).toContain('"X-Robots-Tag": "noindex, nofollow"');
    expect(source).toContain("websitePreviewEditorialBlocks(baseContentBlocks)");
    expect(source).toContain("previewSyntheticSiteName(sourceDisplayName,synthetic)");
    expect(share).toContain("previewSyntheticSiteName(brand.resolved.displayName, synthetic)");
    expect(share).toContain("classifySiteLocalContent(websiteContent)");
  });

  it("hides private planning and network-status projections, keeping editorial intent separate", () => {
    const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",siteSetup:{name:"Barton Demo School",organizationName:"Barton Demo School",
        timezone:"America/Los_Angeles"},
      networkStatusKnown:true,networkAffiliations:[],
      preferences:{delivery:"physical",interestIds:["summer"]},
    });
    const editorial=websitePreviewEditorialBlocks(blocks);
    expect(editorial.some(item=>["site.setup","site.network","learning.interests"].includes(item.channel)))
      .toBe(false);
    expect(blocks.some(item=>item.channel==="site.setup")).toBe(true);
  });
});
