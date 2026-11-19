import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteLocalContentVersions, sites } from "@/db/schema";
import { createSchoolWebsiteStarterContent } from "@/domain/site-local-content";
import { resolveSiteTemplateId } from "@/domain/site-theme";
import { siteBrandPresentationIdentity } from "@/domain/site-brand";
import type { FamilyBrandContext } from "@/domain/school-brand-family";
import { readSavedBrandVersion } from "./site-brand.functions";

/** Private family brand is the exact current saved Site Brand, never the
 * published Website's embedded identity or a mutable marketing copy.
 * Callers must independently authorize any recipient-specific experience. */
export async function readSiteFamilyBrand(siteId:string):Promise<FamilyBrandContext>{
  const [site]=await db.select({id:sites.id,name:sites.name})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if(!site)throw new Error("Site identity unavailable");
  const [latest]=await db.select({content:siteLocalContentVersions.content})
    .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,siteId))
    .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
  const brand=await readSavedBrandVersion(site.id);
  const template=resolveSiteTemplateId(latest?.content.branding?.templateId);
  return {siteName:brand?.resolved.displayName??site.name,
    branding:brand?siteBrandPresentationIdentity(brand.resolved,template)
      : {...createSchoolWebsiteStarterContent(site.name).branding,templateId:template}};
}
