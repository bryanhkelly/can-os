import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { introduceModuleConfigV61,introduceModuleIdsV61,isIntroduceModuleV61 } from "../../src/domain/launch-introduce-v61";
import { marketingPurposeIds,marketingPackageContentSchema,
  initialOutreachPlanV61,composeOutreachDraftV61 } from "../../src/domain/marketing-package-v61";

const source=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Launch Studio V6.1 Introduce integration",()=>{
  it("exposes one creation experience and one library, not three duplicate editors",()=>{
    expect(introduceModuleIdsV61).toEqual(["create-outreach","my-outreach"]);
    for(const id of introduceModuleIdsV61){
      expect(isIntroduceModuleV61(id)).toBe(true);
      const config=introduceModuleConfigV61[id];
      expect(marketingPurposeIds).toContain(config.defaultPurpose);
    }
    expect(isIntroduceModuleV61("recruit")).toBe(false);
    expect(isIntroduceModuleV61("open")).toBe(false);
  });
  it("reuses authorized Establish context and saved immutable Brand",()=>{
    const route=source("src/routes/launch.site.tsx");
    expect(route).toContain("readSiteProgramsAudiencesV61");
    expect(route).toContain("introduceIntent");
    expect(route).toContain("siteIntent={introduceIntent}");
    expect(route).toContain("listSiteMarketingPackagesV61");
    expect(route).toContain("readSiteMarketingSuggestionsV61");
    const controller=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(controller).toContain("readSiteBrandVersionView");
    expect(controller).toContain("createSiteMarketingPackageRelease");
    expect(controller).toContain("listSiteMarketingPackageReleases");
    expect(controller).toContain("downloadMarketingPackageZip");
    expect(controller).not.toContain("localStorage");
  });
  it("keeps choices inside existing Marketing Package content, not a second database",()=>{
    const plan=initialOutreachPlanV61(["adults","older_adults"]);
    const packageContent={
      purpose:"site-announcement" as const,audiences:[],geography:"",
      headline:"A new community is being planned",message:"A proposed community learning center",
      callToAction:"Learn more",formats:["email" as const],plan,
    };
    expect(marketingPackageContentSchema.parse(packageContent).plan).toEqual(plan);
    const draft=composeOutreachDraftV61("Test Site",{...plan,highlights:[{
      source:"experience",id:"financial-literacy",label:"Financial Literacy",role:"primary",
    }]});
    expect(draft.message).toContain("proposed opportunities");
    expect(draft.message).not.toMatch(/now enrolling|accredited|approved to operate/i);
    expect(source("src/db/schema/marketing-packages.ts")).toContain("jsonb");
  });
  it("keeps sending, events, and enrollment independently governed",()=>{
    const controller=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(controller).toContain("admissions/intake");
    expect(controller).toContain("operations/interest-events");
    expect(controller).toContain("Materials are not generated or sent");
    const service=source("src/modules/programs/site-marketing-packages-v61.functions.ts");
    expect(service).toContain("assertSiteSetupScope");
    expect(service).toContain("authorizedSite(data.siteId");
    expect(service).toContain("marketingPackageContentSchema");
  });
});
