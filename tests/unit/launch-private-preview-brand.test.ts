import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  initialSiteBrandConfiguration, resolveSiteBrandVersion, siteBrandPresentationIdentity,
  type SavedSiteBrandVersion, type SiteBrandAsset,
} from "@/domain/site-brand";
import { siteLocalImagePublicationGaps } from "@/domain/site-local-content";

const source = () =>
  readFileSync(new URL("../../src/routes/launch.site-preview.ts", import.meta.url), "utf8");

const siteId="11111111-1111-4111-8111-111111111111";
const logoId="33333333-3333-4333-8333-333333333333";
const asset:SiteBrandAsset={
  id:logoId,siteId,dataUrl:"data:image/png;base64,AAAA",
  altText:"Approved Site logo",rightsConfirmed:true,
  childImageConsent:"no_identifiable_children",revokedAt:null,checksum:"a".repeat(64),
};
const version:SavedSiteBrandVersion={
  id:"22222222-2222-4222-8222-222222222222",siteId,revision:4,
  configuration:{
    ...initialSiteBrandConfiguration("Canonical Learning Center"),
    paletteId:"forest",typographyId:"traditional",
    headingFontId:"palatino",bodyFontId:"verdana",logoAssetId:logoId,
  },
  fingerprint:"b".repeat(64),createdAt:"2026-11-19T00:00:00.000Z",
};

describe("Launch private website preview uses saved Site Brand",()=>{
  it("reads the exact canonical Brand after Site authorization and retains only the wireframe in website copy",()=>{
    const route=source();
    expect(route.indexOf("assertSiteSetupScope(actor,site")).toBeLessThan(
      route.indexOf("readSavedBrandVersion(site.id)"));
    expect(route).toContain("siteBrandPresentationIdentity(savedBrand.resolved");
    expect(route).toContain("resolveSiteTemplateId(copy.branding.templateId)");
    expect(route).toContain("displaySiteName=savedBrand?.resolved.displayName??site.name");
    expect(route).toContain("siteLocalImagePublicationGaps(selectedBranding.logoImage");
    expect(route).toContain("siteLocalImagePublicationGaps(selectedBranding.heroImage");
    expect(route).not.toContain("siteLocalImagePublicationGaps(copy.branding.heroImage)");
  });

  it("resolves canonical colors, fonts, display name and rights-cleared assets without saving duplicate Brand",()=>{
    const brand=resolveSiteBrandVersion(version,new Map([[logoId,asset]]));
    const projected=siteBrandPresentationIdentity(brand,"modern",true);
    expect(brand.displayName).toBe("Canonical Learning Center");
    expect(projected.templateId).toBe("modern");
    expect(projected.paletteId).toBe("forest");
    expect(projected.headingFontId).toBe("palatino");
    expect(projected.bodyFontId).toBe("verdana");
    expect(siteLocalImagePublicationGaps(projected.logoImage??null)).toEqual([]);
    expect(siteBrandPresentationIdentity(brand,"campus").paletteId).toBe("forest");
  });

  it("never places withdrawn or unconsented artwork in the final private preview",()=>{
    const unapproved={...asset,rightsConfirmed:false};
    const brand=resolveSiteBrandVersion(version,new Map([[logoId,unapproved]]));
    const proposed=siteBrandPresentationIdentity(brand,"modern",true);
    expect(siteLocalImagePublicationGaps(proposed.logoImage??null).length).toBeGreaterThan(0);
    expect(siteBrandPresentationIdentity(brand,"modern").logoImage).toBeNull();
  });
});
