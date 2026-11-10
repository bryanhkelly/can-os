import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { sites, sitePublications } from "@/db/schema";
import { publicSiteHost } from "@/domain/public-site-address";
import { resolveSiteTheme, resolveSiteTemplateId } from "@/domain/site-theme";
import { templateDefaultImage } from "@/domain/template-sample-images";
import { normalizeSiteLocalContent } from "@/domain/site-local-content";
import { projectApprovedSchoolSiteMedia } from "@/domain/school-site-media-public";
import { readCurrentLocalContent } from "./site-local-content.server";
import { readApprovedSchoolSitePhotos } from "./site-media-folder.server";

export async function readSchoolBrand(siteId: string) {
  const [site] = await db.select({ name: sites.name, slug: sitePublications.slug,
    status: sitePublications.status }).from(sites)
    .leftJoin(sitePublications, eq(sitePublications.siteId, sites.id))
    .where(eq(sites.id, siteId)).limit(1);
  if (!site) return null;
  const published = await readCurrentLocalContent(siteId);
  const branding = published ? normalizeSiteLocalContent(published.content).branding : null;
  const templateId = resolveSiteTemplateId(branding?.templateId);
  const websiteUrl = site.status === "published" && site.slug ? `https://${publicSiteHost(site.slug)}` : null;
  const media = websiteUrl && site.slug ? projectApprovedSchoolSiteMedia(siteId,
    publicSiteHost(site.slug), await readApprovedSchoolSitePhotos(siteId)) : {};
  return {
    name: site.name,
    templateId,
    theme: resolveSiteTheme(branding?.paletteId, branding?.typographyId,
      branding?.headingFontId, branding?.bodyFontId, templateId),
    websiteUrl,
    logo: branding?.logoImage ? { src: branding.logoImage.dataUrl, altText: branding.logoImage.altText } : null,
    image: branding?.heroImage ? { src: branding.heroImage.dataUrl, altText: branding.heroImage.altText }
      : media.hero ? { src: media.hero.src, altText: media.hero.altText, width: media.hero.width, height: media.hero.height } : templateDefaultImage(templateId, "hero"),
  };
}