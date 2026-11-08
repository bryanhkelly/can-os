import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteLocalContentVersions, sites } from "@/db/schema";
import { createSchoolWebsiteStarterContent, normalizeSiteLocalContent } from "@/domain/site-local-content";
import type { FamilyBrandContext } from "@/domain/school-brand-family";

/**
 * Read only bounded visual identity tokens. The caller must independently
 * authorize the Site (or validate the existing invitation recipient).
 *
 * A private draft may establish colors/typography before publication, but no
 * draft school story, unpublished image, or institutional claim is projected
 * into an anonymous email/landing page.
 */
export async function readSiteFamilyBrand(siteId: string): Promise<FamilyBrandContext> {
  const [site] = await db.select({ id:sites.id, name:sites.name })
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if (!site) throw new Error("School identity unavailable");
  const [latest] = await db.select({ content:siteLocalContentVersions.content })
    .from(siteLocalContentVersions).where(eq(siteLocalContentVersions.siteId,siteId))
    .orderBy(desc(siteLocalContentVersions.revision)).limit(1);
  const content=latest
    ? normalizeSiteLocalContent(latest.content,{allowIncompleteImage:true})
    : createSchoolWebsiteStarterContent(site.name);
  return {
    siteName:site.name,
    // Never return the locally uploaded image in an email or an unlisted
    // page. Artwork rights/consent and publication are independent gates.
    branding:{ ...content.branding, heroImage:null },
  };
}
