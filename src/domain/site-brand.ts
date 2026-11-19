import { z } from "zod";
import { siteBrandDirectionIds } from "./site-brand-direction";
import { siteFontCatalog, sitePaletteIds, siteTypographyIds, resolveSiteTheme } from "./site-theme";

/**
 * Site-wide identity is versioned independently of website content, wireframes,
 * Programs and marketing copy. No "published brand" state exists.
 */
const fontIds = Object.keys(siteFontCatalog) as Array<keyof typeof siteFontCatalog>;
export const siteBrandConfigurationSchema=z.object({
  directionId:z.enum(siteBrandDirectionIds).nullable(),
  paletteId:z.enum(sitePaletteIds),
  typographyId:z.enum(siteTypographyIds),
  headingFontId:z.enum(fontIds as [typeof fontIds[number],...typeof fontIds[number][]]).nullable(),
  bodyFontId:z.enum(fontIds as [typeof fontIds[number],...typeof fontIds[number][]]).nullable(),
  displayName:z.string().trim().min(1).max(120),
  logoAssetId:z.string().uuid().nullable(),
  heroAssetId:z.string().uuid().nullable(),
}).strict();
export type SiteBrandConfiguration=z.infer<typeof siteBrandConfigurationSchema>;
export type SiteBrandAsset={
  id:string;siteId:string;dataUrl:string;altText:string;
  rightsConfirmed:boolean;childImageConsent:"unconfirmed"|"no_identifiable_children"|"guardian_consent_confirmed";
  revokedAt:string|null;checksum:string;
};
export type SavedSiteBrandVersion={
  id:string;siteId:string;revision:number;configuration:SiteBrandConfiguration;
  fingerprint:string;createdAt:string;
};
/** Normalized theme + a stable, reproducible brand revision. */
export type ResolvedSiteBrand={
  siteId:string;brandVersionId:string;revision:number;displayName:string;
  directionId:SiteBrandConfiguration["directionId"];
  paletteId:SiteBrandConfiguration["paletteId"];
  typographyId:SiteBrandConfiguration["typographyId"];
  theme:ReturnType<typeof resolveSiteTheme>;
  logo:SiteBrandAsset|null;hero:SiteBrandAsset|null;
};
export function initialSiteBrandConfiguration(name:string):SiteBrandConfiguration{
  return {directionId:null,paletteId:"signature",typographyId:"editorial",
    headingFontId:null,bodyFontId:null,displayName:name.trim().slice(0,120)||"Learning community",
    logoAssetId:null,heroAssetId:null};
}
export function resolveSiteBrandVersion(version:SavedSiteBrandVersion,assets:ReadonlyMap<string,SiteBrandAsset>):ResolvedSiteBrand{
  const c=siteBrandConfigurationSchema.parse(version.configuration);
  const logo=c.logoAssetId?assets.get(c.logoAssetId)??null:null;
  const hero=c.heroAssetId?assets.get(c.heroAssetId)??null:null;
  return {siteId:version.siteId,brandVersionId:version.id,revision:version.revision,
    displayName:c.displayName,directionId:c.directionId,paletteId:c.paletteId,typographyId:c.typographyId,
    theme:resolveSiteTheme(c.paletteId,c.typographyId,c.headingFontId??undefined,c.bodyFontId??undefined),
    logo,hero};
}
export function assertSiteBrandMediaRights(asset:SiteBrandAsset|null):boolean {
  return !asset || asset.revokedAt===null && asset.rightsConfirmed &&
    asset.childImageConsent!=="unconfirmed" && Boolean(asset.altText.trim());
}
