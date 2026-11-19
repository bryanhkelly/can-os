import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, sitePublications } from "@/db/schema";
import { publicSiteHost } from "@/domain/public-site-address";
import { resolveSiteTheme } from "@/domain/site-theme";
import { templateDefaultImage } from "@/domain/template-sample-images";
import { readSavedBrandVersion } from "./site-brand.functions";

/** The only email/notification Brand reader.
 * Published Sites use the exact Brand pinned by Site publication. An
 * unpublished Site may use its current saved Brand for authorized messages;
 * sender/recipient eligibility remains the responsibility of the sender.
 */
export async function readSchoolBrand(siteId:string){
  const [site]=await db.select({
    name:sites.name,slug:sitePublications.slug,status:sitePublications.status,
    publishedBrandVersionId:sitePublications.brandVersionId,
  }).from(sites).leftJoin(sitePublications,eq(sitePublications.siteId,sites.id))
    .where(eq(sites.id,siteId)).limit(1);
  if(!site)return null;
  const published=site.status==="published";
  const saved=await readSavedBrandVersion(siteId,
    published?site.publishedBrandVersionId:undefined);
  // A published website must never fall back to a newer saved Brand.
  if(published&&!site.publishedBrandVersionId)
    throw new Error("Published Site lacks its pinned Brand version.");
  const brand=saved?.resolved??null;
  return {
    name:brand?.displayName??site.name,
    templateId:"heritage" as const,
    theme:brand?.theme??resolveSiteTheme(),
    websiteUrl:published&&site.slug?"https://"+publicSiteHost(site.slug):null,
    logo:brand?.logo&&!brand.logo.revokedAt&&brand.logo.rightsConfirmed&&
      brand.logo.childImageConsent!=="unconfirmed"
      ? {src:brand.logo.dataUrl,altText:brand.logo.altText}:null,
    image:brand?.hero&&!brand.hero.revokedAt&&brand.hero.rightsConfirmed&&
      brand.hero.childImageConsent!=="unconfirmed"
      ? {src:brand.hero.dataUrl,altText:brand.hero.altText}
      : templateDefaultImage("heritage","hero"),
  };
}
