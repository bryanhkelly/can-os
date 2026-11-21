import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { initialOutreachPlanV61, composeOutreachDraftV61 } from "./marketing-package-v61";
import { suggestMarketingStarterV61 } from "./site-marketing-suggestions-v61";
import { siteIdentityV61Schema } from "./site-identity-v61";

const source = (path:string) =>
  readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Site identity flows from Establish through Website and Introduce",()=>{
  const church=siteIdentityV61Schema.parse({
    siteType:"church_community",faithOrientation:"faith_based",faithTradition:"christian",
  });
  const community=siteIdentityV61Schema.parse({
    siteType:"community_nonprofit",faithOrientation:"not_faith_based",faithTradition:"",
  });

  it("persists in private Site metadata, not host or affiliation state",()=>{
    const service=source("src/modules/programs/site-information-v61.functions.ts");
    expect(service).toContain('section: z.literal("identity")');
    expect(service).toContain("siteIdentityV61: data.identity");
    expect(service).toContain("identitySaved: identity.success");
    const editor=source("src/components/launch-studio/EstablishSiteInformationV61.tsx");
    expect(editor).toContain('await saveIdentity(true)');
    expect(editor).toContain('await saveHosting(true)');
    expect(editor).toContain("Is faith part of this Site's identity?");
  });

  it("uses the same Site Brief for Website and Introduce without adding another CMS",()=>{
    const brief=source("src/domain/site-content-brief-v61.ts");
    const website=source("src/modules/sites/site-website-preview.server.ts");
    const marketing=source("src/modules/programs/site-marketing-packages-v61.functions.ts");
    expect(brief).toContain("identity:siteIdentityV61Schema.nullable()");
    expect(website).toContain("siteIdentity:siteBrief.identity");
    expect(marketing).toContain("identity:reuseAllowed?brief.identity:null");
  });

  it("shows church questions only for a faith-based Site or previously saved answers",()=>{
    const website=source("src/components/launch-studio/WebsiteSiteContentStep.tsx");
    expect(website).toContain("const showFaithFields=faithBased||hasSavedFaithContent");
    expect(website).toContain("canReuse&&churchSite&&");
    expect(website).toContain("Previously saved faith information");
    expect(website).toContain("identityContext.storyPrompt");
  });

  it("tailors consented outreach while retaining an undecorated manual path",()=>{
    const base={story:null,intent:null,websiteCopy:null};
    const faithSuggestion=suggestMarketingStarterV61("Hope","site-announcement",{
      ...base,reuseAllowed:true,identity:church,
    });
    expect(faithSuggestion.content.headline).toContain("faith community");
    expect(faithSuggestion.content.message).toContain("service and shared purpose");
    expect(faithSuggestion.siteIdentity).toEqual(church);
    const secular=suggestMarketingStarterV61("Hope","site-announcement",{
      ...base,reuseAllowed:true,identity:community,
    });
    expect(secular.content.headline).toContain("community organization");
    expect(secular.content.message).not.toContain("faith and service");
    const denied=suggestMarketingStarterV61("Hope","site-announcement",{
      ...base,reuseAllowed:false,identity:church,
    });
    expect(denied.siteIdentity).toBeNull();
    expect(denied.content.message).toBe("");
    const guided=source("src/components/launch-studio/MarketingPackageWizardV61.tsx");
    const controller=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(guided).toContain("plan,siteIntent,currentSuggestion?.siteIdentity");
    expect(controller).toContain("siteIntent,suggestions?.[content.purpose]?.siteIdentity");
    const plan={...initialOutreachPlanV61(),recipients:["community" as const]};
    const faithDraft=composeOutreachDraftV61("Hope",plan,null,faithSuggestion.siteIdentity);
    expect(faithDraft.message).toContain("faith community");
    expect(composeOutreachDraftV61("Hope",plan,null,denied.siteIdentity).message)
      .not.toContain("faith community");
  });
});
