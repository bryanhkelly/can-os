import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(new URL(`../../${path}`,import.meta.url),"utf8");

describe("Launch Studio preview and atomic release share preflight",()=>{
  it("passes the editable package name through the exact rendered preview",()=>{
    const page=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    const preview=source("src/components/launch-studio/MarketingMaterialPreviewV61.tsx");
    expect(page).toContain("title={title}");
    expect(preview).toContain("siteId,title,brandVersionId,format,content");
    expect(preview).toContain("previewSiteMarketingArtifact({data:{siteId,title,brandVersionId,format,content}})");
    expect(preview).toContain("[siteId,title,brandVersionId,format,content,retry]");
  });

  it("rejects the same unapproved copy in both preview and release",()=>{
    const functions=source("src/modules/programs/site-marketing-artifacts.functions.ts");
    expect(functions).toContain("title:z.string().trim().max(120)");
    expect(functions).toContain("marketingPackageClaimsRequireReview(data.title,data.content)");
    expect(functions).toContain("marketingPackageClaimsRequireReview(pkg.title,content)");
    expect(functions).toContain("Package changed. Review the current saved version");
    expect(functions).toContain("readSavedBrandVersion(site.id,pkg.brandVersionId,tx)");
  });

  it("releases all selected formats atomically rather than generating individual materials",()=>{
    const functions=source("src/modules/programs/site-marketing-artifacts.functions.ts");
    const page=source("src/components/launch-studio/MarketingPackagesV61.tsx");
    expect(functions).toContain("createSiteMarketingPackageRelease");
    expect(functions).toContain("await Promise.all(content.formats.map");
    expect(functions).toContain("await tx.insert(siteMarketingPackageReleases).values");
    expect(functions).toContain("await tx.insert(siteArtifactReleases).values(outputs.map");
    expect(functions).toContain("child.brandVersionId===parent.brandVersionId");
    expect(functions).toContain("child.sourcePackageRevision===parent.sourcePackageRevision");
    expect(functions).toContain("new Set(formats).size===formats.length");
    expect(page).toContain("createSiteMarketingPackageRelease");
    expect(page).toContain("downloadMarketingPackageZip");
    expect(page).not.toContain("createSiteMarketingRelease");
  });
});
