import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const source=(file:string)=>readFileSync(
  new URL("../../"+file,import.meta.url),"utf8");

describe("V6.1 Site Brand component and service ownership",()=>{
  it("keeps one authorized atomic Website & Brand save",()=>{
    const route=source("src/routes/site-website.tsx");
    const api=source("src/modules/sites/site-website-preview.functions.ts");
    expect(route).toContain("saveSiteWebsiteAndBrand");
    expect(route).not.toContain("saveChurchWebsiteDraft");
    expect(route).not.toContain("saveSiteBrandVersion({");
    expect(api).toContain("db.transaction(async tx=>");
    expect(api).toContain("publishPartnerLocalContentWithinTransaction");
    expect(api).toContain("saveSiteBrandVersionWithinTransaction");
    expect(api.indexOf("publishPartnerLocalContentWithinTransaction(actor"))
      .toBeLessThan(api.indexOf("saveSiteBrandVersionWithinTransaction(actor"));
  });
  it("extracts controlled website steps without duplicating persistent editors",()=>{
    const route=source("src/routes/site-website.tsx");
    for(const step of ["WebsiteBrandIdentityStep","WebsiteSiteContentStep",
      "WebsiteVisualIdentityStep","WebsiteReviewStep"]){
      expect(route).toContain("<"+step);
      expect(source("src/components/launch-studio/"+step+".tsx")).not.toContain("db.transaction");
    }
    expect(route).not.toContain("const churchFields:");
    expect(route).not.toContain("<WebsiteCopyField");
  });
  it("keeps Introduce Package state and releases in one controller",()=>{
    const controller=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(controller).toContain("<MarketingPackageWizardV61");
    expect(controller).toContain("<MarketingPackageReleaseHistoryV61");
    expect(controller).toContain("createSiteMarketingPackageRelease");
    const wizard=source("src/components/launch-studio/MarketingPackageWizardV61.tsx");
    const history=source("src/components/launch-studio/MarketingPackageReleaseHistoryV61.tsx");
    expect(wizard).not.toContain("siteMarketingPackages).values");
    expect(history).not.toContain("saveSiteMarketingPackageV61");
  });
  it("reuses the same approved-media decision without adding another upload flow",()=>{
    const identity=source("src/domain/site-brand.ts");
    const r2=source("src/modules/sites/site-media-folder.server.ts");
    expect(identity).toContain("approvedSiteMediaUsage");
    expect(r2).toContain("approvedSiteDocumentMediaUsage");
    expect(r2).toContain("storageProvider");
    const packageRenderer=source("src/modules/programs/site-marketing-artifacts.server.ts");
    expect(packageRenderer).toContain("readSavedBrandVersion");
    expect(packageRenderer).not.toContain("new SiteBrand");
  });
});
