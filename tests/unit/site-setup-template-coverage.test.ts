import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { siteTemplateIds } from "@/domain/site-theme";
import { siteLaunchInterestIds } from "@/domain/site-launch-preferences";
import { emptySiteLocalContent } from "@/domain/site-local-content";
import { renderPublicSiteHtml } from "@/domain/public-site-html";
import { defaultSiteContentChannelConfig, resolveSiteContentBlocks,
  siteContentChannelIds } from "@/domain/site-content-channels";

const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
const choices=["physical","digital","both"] as const;
const expectedDelivery={
  physical:"Physical / in person",
  digital:"Digital / online",
  both:"Physical and digital",
};
const siteSetup={name:"Valor School",organizationName:"Local Host Church",
  city:"Brentwood",state:"CA",timezone:"America/Los_Angeles"};
const sourceFeeds=(delivery:typeof choices[number])=>({
  mode:"private" as const,siteSetup,
  preferences:{delivery,interestIds:[...siteLaunchInterestIds]},
  networkStatusKnown:true,
  networkAffiliations:[{name:"Community Learning Network",status:"pending" as const}],
});
const templateSite=(templateId:typeof siteTemplateIds[number])=>({
  host:"example.can-os.com",
  site:{name:siteSetup.name,organizationName:siteSetup.organizationName},
  offerings:[],
  localContent:{...emptySiteLocalContent,heroHeadline:"Local learning",
    localDescription:"Learning plans in progress",
    branding:{...emptySiteLocalContent.branding,templateId}},
});

describe("Every Site-first setup choice has a native template home",()=>{
  it("covers all eight registered program interests, Site identity and network status",()=>{
    const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,sourceFeeds("both"));
    const setup=blocks.find(x=>x.channel==="site.setup");
    const network=blocks.find(x=>x.channel==="site.network");
    const interests=blocks.find(x=>x.channel==="learning.interests");
    expect(setup?.items.map(x=>x.id)).toEqual([
      "site-name","responsible-organization","planning-location","site-timezone","delivery-intent",
    ]);
    expect(network?.items[0]?.title).toBe("Community Learning Network");
    expect(network?.items[0]?.label).toBe("Affiliation: pending");
    expect(interests?.items.map(x=>x.id)).toEqual([...siteLaunchInterestIds]);
    expect(interests?.items.every(x=>x.link===undefined)).toBe(true);
  });
  it("renders all three delivery choices, all interests and all setup fields in all seven templates",()=>{
    for(const delivery of choices){
      const blocks=resolveSiteContentBlocks(defaultSiteContentChannelConfig,sourceFeeds(delivery));
      for(const templateId of siteTemplateIds){
        const html=renderPublicSiteHtml(
          {...templateSite(templateId),contentBlocks:blocks},{localPreview:true});
        for(const id of ["site.setup","site.network","learning.interests"])
          expect(html).toContain('data-content-channel="'+id+'"');
        for(const text of [siteSetup.name,siteSetup.organizationName,
          "Brentwood, CA",siteSetup.timezone,expectedDelivery[delivery],
          "Community Learning Network","Grades 6–8","Grades 9–12",
          "Afterschool","Weekend Learning","Summer &amp; Breaks",
          "Evening Learning","Adult Learning","Senior Programs"])
          expect(html,templateId+"/"+delivery+" missing "+text).toContain(text);
      }
    }
  });
  it("never makes planning selections or network membership public automatically",()=>{
    const feeds=sourceFeeds("physical");
    const published=resolveSiteContentBlocks(defaultSiteContentChannelConfig,
      {...feeds,mode:"public"});
    expect(published.some(b=>
      ["site.setup","site.network","learning.interests"].includes(b.channel))).toBe(false);
    const html=renderPublicSiteHtml({...templateSite("modern"),contentBlocks:published});
    expect(html).not.toContain('data-content-channel="site.setup"');
    expect(html).not.toContain('data-content-channel="site.network"');
    expect(html).not.toContain('data-content-channel="learning.interests"');
    expect(html).not.toContain("Affiliation: pending");
    expect(html).not.toContain("Planned location");
    expect(html).not.toContain("Planning intent");
  });
  it("includes a registered public Class channel without publishing private Class or enrollment data",()=>{
    expect(siteContentChannelIds).toContain("learning.classes");
    const reader=source("src/modules/sites/site-published-classes.server.ts");
    expect(reader).toContain("status='approved'");
    expect(reader).toContain("cv.state='published' AND cv.visibility='public'");
    expect(reader).toContain("adoption.approval_status='approved'");
    expect(reader).toContain("c.state='active'");
    expect(reader).toContain("CAN_UNIFIED_CLASS_COMMANDS_ENABLED");
    expect(reader).not.toContain("learner_person_id");
    expect(reader).not.toContain("room_url");
    const config=defaultSiteContentChannelConfig;
    const blocks=resolveSiteContentBlocks(config,{mode:"public",classes:[]});
    expect(blocks.some(b=>b.channel==="learning.classes")).toBe(false);
  });
  it("all Site renderer entry points use source channels rather than page HTML injection",()=>{
    const route=source("src/routes/launch.site-preview.ts");
    const editor=source("src/modules/sites/site-website-preview.server.ts");
    const published=source("src/modules/sites/site-public-catalog.server.ts");
    const templates=source("src/domain/public-site-templates.ts");
    expect(route).toContain("resolveSiteContentBlocks(config,");
    expect(editor).toContain("contentBlocks");
    expect(published).toContain("site.metadata.publishedWebsiteContentChannels");
    expect(published).not.toContain("site.metadata.websiteContentChannels");
    for(const slot of ["channelsLearning","channelsCommunity","channelsClosing"]){
      expect((templates.match(new RegExp('"'+slot+'"',"g"))??[]).length).toBe(7);
    }
  });
});
