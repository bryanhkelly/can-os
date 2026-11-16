import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Site-owned content source and publication contract",()=>{
  it("does not splice program-interest HTML into an already-rendered preview",()=>{
    const route=read("src/routes/launch.site-preview.ts");
    const renderer=read("src/domain/public-site-html.ts");
    expect(route).not.toContain("renderSiteFirstPrivatePlan");
    expect(route).toContain("resolveSiteContentBlocks(config,");
    expect(renderer).toContain("contentChannelAt(");
    expect(renderer).toContain("composePublicSiteHome(templateId,");
    expect(renderer).not.toContain("renderSiteFirstPrivatePlan");
  });

  it("separates Site preview drafts from anonymous public content snapshots",()=>{
    const publicSite=read("src/modules/sites/site-public-catalog.server.ts");
    const editor=read("src/modules/sites/site-website-preview.server.ts");
    const service=read("src/modules/sites/site-content-channels.server.ts");
    expect(publicSite).toContain("site.metadata.publishedWebsiteContentChannels");
    expect(publicSite).not.toContain("site.metadata.websiteContentChannels");
    expect(editor).toContain("siteConfiguration?.metadata?.websiteContentChannels");
    expect(service).toContain("publishedWebsiteContentChannels: draft");
    expect(service).toContain("requirePartnerWebsiteEditor(actor, tx, siteWebsiteLocalPublishCapability)");
    expect(service).toContain('assertSiteSetupScope(actor, site, "program.launch.start")');
    expect(service).toContain("if (current.revision !== input.expectedRevision)");
  });

  it("uses source-bound blocks rather than arbitrary URLs or approved-Program writes",()=>{
    const config=read("src/domain/site-content-channels.ts");
    const editor=read("src/components/launch-studio/SiteContentChannelEditor.tsx");
    expect(config).toContain('feeds.mode !== "private"');
    expect(config).toContain("noncreditEnrollmentOrigin(feeds.enrollmentOrigin)");
    expect(config).toContain('feeds.mode === "public" && origin');
    expect(editor).toContain('saveSiteContentChannels({data:');
    expect(editor).toContain('publishSiteContentChannels({data:');
    expect(editor).not.toContain("dangerouslySetInnerHTML");
    const renderer=read("src/domain/public-site-html.ts");
    expect(renderer).toContain("escapePublicHtml(item.title)");
    expect(renderer).toContain("escapePublicHtml(item.description)");
  });
});
