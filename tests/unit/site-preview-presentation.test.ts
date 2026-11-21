import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import { renderPrivateWebsitePreviewHtml } from "@/domain/private-website-preview";
import { renderSharedSitePreview } from "@/domain/site-preview-sharing";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import {
  defaultSiteContentChannelConfig, resolveSiteContentBlocks, websitePreviewEditorialBlocks,
} from "@/domain/site-content-channels";

const siteId="d8082b23-b28c-454d-a144-6860ef19d9ea";
const name="Barton Demo School";
const read=(path:string)=>readFileSync(path,"utf8");

describe("Saved Site website presentation",()=>{
  it("renders the exact name and a normal top preview banner, regardless of synthetic metadata",()=>{
    const page={host:"barton.can-os.com",
      site:{name,organizationName:name},offerings:[],
      localContent:createSchoolWebsiteStarterContent(name)};
    const html=renderPublicSiteHtml(page,{path:"/",localPreview:true});
    expect(html).toContain(name);
    expect(html).toContain("At Barton Demo School");
    expect(html).toBe(renderPublicSiteHtml({...page,demonstration:true},{localPreview:true}));
    const wrapped=renderPrivateWebsitePreviewHtml(html,siteId,["/"],true,"site",true);
    expect(wrapped).toContain("Private Site website preview");
    expect(wrapped).not.toContain("Demonstration website preview");
    expect(wrapped).toContain(name);
    const share=renderSharedSitePreview(html,siteId,"A".repeat(43),["/"],true);
    expect(share).toContain("Proposed learning community · Website preview");
    expect(share).not.toContain("Demonstration website preview");
    expect(share).toContain(name);
  });
  it("shows the administrator's configured Site and network sections rather than filtering them",()=>{
    const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"private",siteSetup:{name,organizationName:name,
        city:"Brentwood",state:"CA",timezone:"America/Los_Angeles"},
      networkStatusKnown:true,
      networkAffiliations:[{name:"COGIC",status:"pending"}],
      preferences:{delivery:"both",interestIds:["summer"]},
    });
    expect(blocks.some(block=>block.channel==="site.setup")).toBe(true);
    expect(blocks.some(block=>block.channel==="site.network")).toBe(true);
    const visible=websitePreviewEditorialBlocks(blocks);
    expect(visible.map(block=>block.channel)).toContain("site.setup");
    expect(visible.map(block=>block.channel)).toContain("site.network");
    expect(visible.map(block=>block.channel)).not.toContain("learning.interests");
    const html=renderPublicSiteHtml({
      host:"barton.can-os.com",site:{name,organizationName:name},
      offerings:[],localContent:createSchoolWebsiteStarterContent(name),
      contentBlocks:visible,
    },{localPreview:true});
    expect(html).toContain('data-content-channel="site.setup"');
    expect(html).toContain('data-content-channel="site.network"');
    expect(html).toContain("Brentwood, CA");
    expect(html).toContain("Affiliation: pending");
  });
  it("uses shared saved website preview pages for new R2 share links",()=>{
    const route=read("src/routes/launch.site-preview.ts");
    const editor=read("src/modules/sites/site-website-preview.server.ts");
    const sharing=read("src/modules/sites/site-preview-sharing.functions.ts");
    expect(route).toContain("websitePreviewEditorialBlocks(baseContentBlocks)");
    expect(editor).toContain("websitePreviewEditorialBlocks(baseContentBlocks)");
    expect(sharing).toContain("getPartnerWebsitePreview(actor)");
    expect(sharing).toContain("writeSitePreviewSnapshot(");
    expect(sharing).not.toContain("projectShareableSitePreview({");
  });
});
