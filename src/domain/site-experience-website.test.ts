import { describe, expect, it } from "vitest";
import {
  defaultSiteContentChannelConfig, resolveSiteContentBlocks,
  siteContentChannelConfigSchema, projectMissingSiteExperienceSectionsForPreview,
} from "./site-content-channels";
import { availablePublicSitePaths, renderPublicSiteHtml } from "./public-site-html";
import { publicSitePagePaths } from "./public-site-paths";
import { siteLaunchPreferencesSchema } from "./site-launch-preferences";
import { websiteTemplatePageSourcesComplete } from "./website-template-source-map";

const intent=siteLaunchPreferencesSchema.parse({
  delivery:"both",interestIds:["adult","senior"],
  audienceIds:["adults","older_adults"],timingIds:["daytime"],
  experienceIds:["digital-confidence","arts-creativity"],
  customExperiences:["Community gardening"],
});
const read=()=>resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
  mode:"private",preferences:intent,
});
describe("Site Experiences website integration",()=>{
  it("projects curated and local Experiences to homepage and dedicated page",()=>{
    const blocks=read().filter(block=>block.channel==="learning.experiences");
    expect(blocks.map(block=>block.page??"/")).toEqual(["/","/experiences"]);
    expect(blocks[0]?.items.map(item=>item.title)).toEqual([
      "Digital Confidence","Arts & Creativity","Community gardening",
    ]);
    expect(blocks[0]?.items[0]?.label).toContain("Older Adult Learning");
    expect(blocks[0]?.items.every(item=>item.link===undefined)).toBe(true);
    expect(blocks[0]?.items).toHaveLength(3);
  });
  it("renders planned Experience content as a safe, non-enrollable page",()=>{
    const page={host:"example.can-os.com",site:{name:"Example Site",
      organizationName:"Example Church"},offerings:[],contentBlocks:read()};
    expect(availablePublicSitePaths(page)).toContain("/experiences");
    const html=renderPublicSiteHtml(page,{path:"/experiences",localPreview:true});
    expect(html).toContain("Digital Confidence");
    expect(html).toContain("Community gardening");
    expect(html).toContain("planning ideas, not confirmed or enrollable offerings");
    expect(html).not.toContain('href="/learn/enroll');
  });
  it("does not invent Experience sections or reveal excluded private layout blocks",()=>{
    const empty=resolveSiteContentBlocks(defaultSiteContentChannelConfig,{
      mode:"public",preferences:siteLaunchPreferencesSchema.parse({
        delivery:"digital",interestIds:["adult"],experienceIds:[],
      }),
    });
    expect(empty.some(block=>block.channel==="learning.experiences")).toBe(false);
    const disabled=siteContentChannelConfigSchema.parse({
      ...defaultSiteContentChannelConfig,
      blocks:defaultSiteContentChannelConfig.blocks.map(block=>
        block.channel==="learning.experiences"?{...block,enabled:false}:block),
    });
    expect(resolveSiteContentBlocks(disabled,{mode:"private",preferences:intent})
      .some(block=>block.channel==="learning.experiences")).toBe(false);
    expect(projectMissingSiteExperienceSectionsForPreview(disabled,intent)).toEqual([]);
  });
  it("adds private suggestions to older layouts without a parallel data store",()=>{
    const legacy={...defaultSiteContentChannelConfig,
      blocks:defaultSiteContentChannelConfig.blocks.filter(block=>
        block.channel!=="learning.experiences")};
    const projected=projectMissingSiteExperienceSectionsForPreview(legacy,intent);
    expect(projected.map(block=>block.page??"/")).toEqual(["/","/experiences"]);
    expect(projected[0]?.items[0]?.title).toBe("Digital Confidence");
    expect(projectMissingSiteExperienceSectionsForPreview(legacy,null)).toEqual([]);
  });
  it("keeps page and provenance registries aligned",()=>{
    expect(publicSitePagePaths).toContain("/experiences");
    expect(websiteTemplatePageSourcesComplete).toBe(true);
  });
});
