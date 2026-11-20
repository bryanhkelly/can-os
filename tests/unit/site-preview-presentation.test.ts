import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import { renderPrivateWebsitePreviewHtml } from "@/domain/private-website-preview";
import { projectShareableSitePreview, renderSharedSitePreview } from "@/domain/site-preview-sharing";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import {
  defaultSiteContentChannelConfig, resolveSiteContentBlocks, websitePreviewEditorialBlocks,
} from "@/domain/site-content-channels";

const siteId="d8082b23-b28c-454d-a144-6860ef19d9ea";
const name="Barton Demo School";
const read=(path:string)=>readFileSync(path,"utf8");

describe("Website previews respect the saved Site identity and exclude setup administration",()=>{
  it("displays the complete saved Site and Organization names, including Demo, verbatim",()=>{
    const page=projectShareableSitePreview({
      siteName:name,organizationName:name,
      content:createSchoolWebsiteStarterContent(name),
    });
    const html=renderPublicSiteHtml(page,{path:"/",localPreview:true});
    expect(page.site.name).toBe(name);
    expect(page.site.organizationName).toBe(name);
    expect(html).toContain(name);
    expect(html).toContain("At Barton Demo School");
    expect(html).not.toContain("How your learning Site is taking shape");
    expect(html).not.toContain("Scheduling reference");
    const wrapped=renderPrivateWebsitePreviewHtml(html,siteId,["/"],true,"site",true);
    expect(wrapped).toContain("Demonstration website preview");
    expect(wrapped).toContain(name);
  });

  it("preserves names in shared preview links as well",()=>{
    const page=projectShareableSitePreview({
      siteName:name,organizationName:name,
      content:createSchoolWebsiteStarterContent(name),
    });
    const html=renderPublicSiteHtml(page,{path:"/",localPreview:true});
    const wrapped=renderSharedSitePreview(html,siteId,"A".repeat(43),["/"],true);
    expect(wrapped).toContain(name);
    expect(wrapped).toContain("Demonstration website preview");
    expect(wrapped).toContain('content="noindex,nofollow"');
  });

  it("removes private setup and network cards from website presentation only",()=>{
    const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",
      siteSetup:{name,organizationName:name,timezone:"America/Los_Angeles"},
      networkStatusKnown:true,
      networkAffiliations:[],
      preferences:{delivery:"both",interestIds:["summer"]},
    });
    expect(blocks.some(block=>block.channel==="site.setup")).toBe(true);
    expect(blocks.some(block=>block.channel==="site.network")).toBe(true);
    const editorial=websitePreviewEditorialBlocks(blocks);
    for(const block of editorial)
      expect(["site.setup","site.network","learning.interests"]).not.toContain(block.channel);
    const html=renderPublicSiteHtml({
      host:"example.can-os.com",site:{name,organizationName:name},
      localContent:createSchoolWebsiteStarterContent(name),
      offerings:[],contentBlocks:editorial,
    },{localPreview:true});
    for(const item of ["How your learning Site is taking shape","Private setup facts",
      "Saved Site","Scheduling reference","Planning intent","Independent Site"])
      expect(html).not.toContain(item);
    expect(html).toContain(name);
  });

  it("applies the same exclusion in both launch and Website & Brand previews",()=>{
    const launch=read("src/routes/launch.site-preview.ts");
    const studio=read("src/modules/sites/site-website-preview.server.ts");
    const sharing=read("src/modules/sites/site-preview-sharing.functions.ts");
    expect(launch).toContain("websitePreviewEditorialBlocks(baseContentBlocks)");
    expect(studio).toContain("websitePreviewEditorialBlocks(baseContentBlocks)");
    expect(launch).toContain("savedBrand?.resolved.displayName??site.name");
    expect(sharing).toContain("siteName: brand.resolved.displayName");
    expect(sharing).toContain('organizationName: organization?.name ?? "Proposed learning community"');
    expect(launch).not.toContain("previewSyntheticSiteName");
    expect(sharing).not.toContain("previewSyntheticSiteContent");
  });
});
