import { describe,expect,it } from "vitest";
import {
  assertSiteBrandMediaRights, initialSiteBrandConfiguration, resolveSiteBrandVersion,
  siteBrandConfigurationSchema, siteBrandPresentationIdentity,
  type SavedSiteBrandVersion, type SiteBrandAsset,
} from "@/domain/site-brand";
import { createSchoolWebsiteStarterContent, websiteCopyOnlyForStorage } from "@/domain/site-local-content";
import { renderSiteMarketingArtifact } from "@/domain/site-artifact-renderer";
import { initialMarketingContent } from "@/domain/marketing-package-v61";
import { contrastRatio } from "@/domain/color-contrast";

const siteId="11111111-1111-4111-8111-111111111111";
const brandId="22222222-2222-4222-8222-222222222222";
const logoId="33333333-3333-4333-8333-333333333333";
const asset:SiteBrandAsset={
  id:logoId,siteId,dataUrl:"data:image/png;base64,AAAA",altText:"Site logo",
  checksum:"a".repeat(64),rightsConfirmed:true,
  childImageConsent:"no_identifiable_children",revokedAt:null,
};
const config={
  ...initialSiteBrandConfiguration("Riverbend Community"),
  directionId:"belonging" as const,paletteId:"forest" as const,
  typographyId:"traditional" as const,headingFontId:"palatino" as const,
  bodyFontId:"verdana" as const,logoAssetId:logoId,
};
const version:SavedSiteBrandVersion={
  id:brandId,siteId,revision:3,configuration:config,
  fingerprint:"b".repeat(64),createdAt:"2026-11-19T00:00:00.000Z",
};
const brand=resolveSiteBrandVersion(version,new Map([[logoId,asset]]));

describe("canonical immutable Site Brand domain",()=>{
  it("validates the exact Site Brand fields, no wireframes or marketing metadata",()=>{
    expect(siteBrandConfigurationSchema.parse(config)).toEqual(config);
    expect(()=>siteBrandConfigurationSchema.parse({...config,templateId:"modern"})).toThrow();
    expect(()=>siteBrandConfigurationSchema.parse({...config,paletteId:"injected-css"})).toThrow();
  });
  it("projects the exact version into a consistent Site-facing identity",()=>{
    expect(brand.brandVersionId).toBe(brandId);
    expect(brand.revision).toBe(3);
    expect(brand.logo?.id).toBe(logoId);
    expect(brand.theme.displayFont).toContain("Palatino");
    expect(brand.theme.bodyFont).toContain("Verdana");
    expect(contrastRatio(brand.theme.ink,brand.theme.canvas)).toBeGreaterThanOrEqual(4.5);
    const first=siteBrandPresentationIdentity(brand,"modern");
    const second=siteBrandPresentationIdentity(brand,"community");
    expect(first.templateId).not.toBe(second.templateId);
    expect({...first,templateId:undefined}).toEqual({...second,templateId:undefined});
  });
  it("separates website copy from versioned Brand identity",()=>{
    const original=createSchoolWebsiteStarterContent("Riverbend Community");
    original.branding={...original.branding,brandDirectionId:"innovation",paletteId:"brand-modern",
      typographyId:"contemporary",logoImage:{dataUrl:asset.dataUrl,
      altText:asset.altText,rightsConfirmed:true,childImageConsent:"no_identifiable_children"},
      templateId:"modern"};
    const stored=websiteCopyOnlyForStorage(original);
    expect(stored.branding).toEqual({theme:"classic",templateId:"modern",heroImage:null});
    expect(stored.welcomeMessage).toBe(original.welcomeMessage);
    expect(original.branding.logoImage).not.toBeNull();
  });
  it("blocks future use of withdrawn or nonconsented media without erasing version identity",()=>{
    expect(assertSiteBrandMediaRights(asset)).toBe(true);
    expect(assertSiteBrandMediaRights({...asset,revokedAt:"2026-11-19T00:00:00Z"})).toBe(false);
    expect(assertSiteBrandMediaRights({...asset,childImageConsent:"unconfirmed"})).toBe(false);
    expect(assertSiteBrandMediaRights({...asset,rightsConfirmed:false})).toBe(false);
    const revoked=resolveSiteBrandVersion(version,new Map([
      [logoId,{...asset,revokedAt:"2026-11-19T00:00:00Z"}],
    ]));
    expect(revoked.brandVersionId).toBe(brandId);
    expect(siteBrandPresentationIdentity(revoked).logoImage).toBeNull();
  });
});

describe("bounded outputs generated from one exact Site Brand",()=>{
  const content={
    ...initialMarketingContent("Riverbend Community","site-announcement"),
    headline:"A community is taking shape.",
    message:"Meet neighbors and explore future learning possibilities.",
  };
  it("produces deterministic, version-pinned SVG flyer, handout and social output",()=>{
    for(const format of ["flyer","handout","social"] as const){
      const first=renderSiteMarketingArtifact({format,brand,content,websiteUrl:null});
      const again=renderSiteMarketingArtifact({format,brand,content,websiteUrl:null});
      expect(first).toEqual(again);
      expect(first.mimeType).toBe("image/svg+xml");
      expect(first.body).toContain("Riverbend Community");
      expect(first.body).toContain("Not accepting enrollment");
      expect(first.body).not.toContain("<script");
    }
  });
  it("produces safe branded HTML with no send or tracking behavior",()=>{
    const output=renderSiteMarketingArtifact({format:"email",brand,
      content:{...content,message:"Visit <unsafe> & learn more."},websiteUrl:null});
    expect(output.mimeType).toBe("text/html");
    expect(output.body).toContain("&lt;unsafe&gt;");
    expect(output.body).toContain("&amp;");
    expect(output.plainText).toContain("Visit <unsafe>");
    expect(output.body).not.toContain("<script");
  });
  it("refuses short-lived or missing QR destinations",()=>{
    expect(()=>renderSiteMarketingArtifact({format:"qr-card",brand,content,websiteUrl:null}))
      .toThrow(/durable/);
  });
});
