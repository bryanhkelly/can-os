import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { emptySiteLocalContent, normalizeSiteLocalContent } from "@/domain/site-local-content";
import { emptySiteHostingV61, siteHostingV61Schema } from "@/domain/site-information-v61";
import { fundingStatusPublicNote, projectSiteFundingPublicContext } from "@/domain/site-funding-public";
import { suggestMarketingStarterV61 } from "@/domain/site-marketing-suggestions-v61";
import { availablePublicSitePaths, renderPublicSiteHtml } from "@/domain/public-site-html";

describe("Website & Brand consent and prelaunch funding",()=>{
  it("offers exactly six steps with content consent before editing and review",()=>{
    const source=readFileSync("src/routes/site-website.tsx","utf8");
    expect(source).toContain(
      '["brand", "wireframe", "visual", "consent", "content", "review"]',
    );
  });

  it("keeps a new Site's unconsented editorial fields empty",()=>{
    expect(emptySiteLocalContent.contentReuseConsent).toBe("unselected");
    expect(emptySiteLocalContent.heroHeadline).toBe("");
    expect(emptySiteLocalContent.localDescription).toBe("");
    expect(normalizeSiteLocalContent({
      ...emptySiteLocalContent,contentReuseConsent:"denied",
    }).contentReuseConsent).toBe("denied");
    expect(()=>normalizeSiteLocalContent({
      ...emptySiteLocalContent,contentReuseConsent:"unexpected" as never,
    })).toThrow();
    const previewServer=readFileSync("src/modules/sites/site-website-preview.server.ts","utf8");
    expect(previewServer).not.toContain("prepareWebsiteCopyFromSiteInformation(createSchoolWebsiteStarterContent");
  });

  it("does not reuse source data for marketing when a Site declines",()=>{
    const suggestion=suggestMarketingStarterV61("Rivermere Community","site-announcement",{
      reuseAllowed:false,
      story:{motivations:["belonging"],communityNeed:"A real community need",
        distinctives:[],foundingStory:"A private founding story",values:[],
        experiences:[],futureVision:"A future vision"},
      intent:null,websiteCopy:null,
    });
    expect(suggestion.content.headline).toBe("");
    expect(suggestion.content.message).toBe("");
    expect(suggestion.content.audiences).toEqual([]);
    expect(suggestion.sources).toEqual([]);
    expect(suggestion.websiteAlternative).toBeNull();
  });

  it("captures tax status without treating it as an approved public claim",()=>{
    const reported=siteHostingV61Schema.parse({
      ...emptySiteHostingV61(),nonprofitStatus:"recognized_501c3",
      nonprofitOrganizationName:"Rivermere Foundation",nonprofitEin:"12-3456789",
    });
    const context=projectSiteFundingPublicContext(reported);
    expect(context?.reportedStatus).toBe("recognized_501c3");
    expect(context?.organizationName).toBe("Rivermere Foundation");
    expect(context?.verification).toBe("self_reported");
    expect(JSON.stringify(context)).not.toContain("12-3456789");
    expect(fundingStatusPublicNote(context)).toContain("awaits independent verification");
    expect(siteHostingV61Schema.safeParse({...reported,nonprofitEin:"bad-EIN"}).success).toBe(false);
  });

  it("provides tuition and funding boilerplate even without an authorized offering",()=>{
    const page={
      host:"rivermere.example.org",
      site:{name:"Rivermere Community",organizationName:"Rivermere Foundation"},
      offerings:[],
      siteFunding:projectSiteFundingPublicContext({...emptySiteHostingV61(),
        nonprofitStatus:"pending",nonprofitEin:"12-3456789"}),
    };
    expect(availablePublicSitePaths(page)).toContain("/tuition");
    const html=renderPublicSiteHtml(page,{path:"/tuition"});
    expect(html).toContain("Tuition and program fees are being established");
    expect(html).toContain("Public and community funding");
    expect(html).toContain("Tax-exempt recognition was reported as pending");
    expect(html).not.toContain("12-3456789");
  });
});
