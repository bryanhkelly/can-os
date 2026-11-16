import { createFileRoute } from "@tanstack/react-router";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, siteAffiliations, sitePublications, sites } from "@/db/schema";
import { schoolPlanningLocationSchema } from "@/domain/site-setup-configuration";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertSiteSetupScope } from "@/domain/site-setup-scope";
import { AuthorizationError } from "@/domain/command-context";
import { readAcademicProgramCatalog } from "@/modules/sites/academic-program-catalog.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { toPublicSiteEnrichment } from "@/domain/public-site-catalog";
import { publicSiteHost } from "@/domain/public-site-address";
import { readCurrentLocalContent, readLocalContentHistory } from "@/modules/sites/site-local-content.server";
import { emptySiteLocalContent, emptySiteLocalBranding, normalizeSiteLocalContent, siteLocalImagePublicationGaps, type SiteLocalContent } from "@/domain/site-local-content";
import { availablePublicSitePaths, renderPublicSiteHtml, type PublicSitePage } from "@/domain/public-site-html";
import { isPublicSitePagePath } from "@/domain/public-site-paths";
import { renderPrivateWebsitePreviewHtml, privateWebsitePreviewErrorPage } from "@/domain/private-website-preview";
import { siteLaunchPreferencesSchema } from "@/domain/site-launch-preferences";
import { siteFirstPreviewHeaders } from "@/domain/site-first-preview";
import { safeReadSiteContentChannelConfig, resolveSiteContentBlocks } from "@/domain/site-content-channels";
import { readOptionalSiteNoncreditReleases } from "@/modules/sites/site-noncredit-releases.server";
import { readOptionalSitePublishedClasses } from "@/modules/sites/site-published-classes.server";
import { noncreditEnrollmentOrigin } from "@/domain/site-noncredit-public";
import { projectSiteEnrollmentOpportunities } from "@/domain/site-enrollment-opportunities";

function failure(status:number,title:string,message:string){
  return new Response(privateWebsitePreviewErrorPage(title,message), {
    status,headers:siteFirstPreviewHeaders,
  });
}

/**
 * Same Site renderer as the public Site and Website & Brand Studio, but
 * for an authenticated registrar's newly created Site. This intentionally
 * does NOT grant the separate site_website_editor role, publish a Site,
 * expose unapproved offerings or create registration rights.
 */
export const Route=createFileRoute("/launch/site-preview")({
  server:{handlers:{
    GET:async ({request})=>{
      const url=new URL(request.url);
      const ids=url.searchParams.getAll("siteId");
      const pages=url.searchParams.getAll("page");
      const path=pages[0]??"/";
      if(ids.length!==1 || pages.length>1 ||
          [...url.searchParams.keys()].some(k=>k!=="siteId"&&k!=="page") ||
          !/^[a-f\d]{8}-[a-f\d]{4}-[1-8a-f\d]{4}-[89ab\d]{4}-[a-f\d]{12}$/i.test(ids[0]??"") ||
          !isPublicSitePagePath(path))
        return failure(404,"Site preview unavailable","Select an authorized Site and website page in Launch Studio.");

      try {
        const actor=await getCommandContext(request);
        const [site]=await db.select({
          id:sites.id, organizationId:sites.organizationId, name:sites.name,slug:sites.slug,
          timezone:sites.timezone, metadata:sites.metadata, organizationName:organizations.name,
        }).from(sites).innerJoin(organizations,eq(organizations.id,sites.organizationId))
          .where(eq(sites.id,ids[0]!)).limit(1);
        assertSiteSetupScope(actor,site,"program.launch.start");

        const [publication]=await db.select({slug:sitePublications.slug})
          .from(sitePublications).where(eq(sitePublications.siteId,site.id)).limit(1);
        if(!publication) return failure(409,"Website address needed",
          "A private website address must be reserved by an authorized Site operator.");

        const [academics,enrichment,published,history]=await Promise.all([
          readAcademicProgramCatalog(site.id),
          readEnrichmentCatalog(site.id),
          readCurrentLocalContent(site.id),
          readLocalContentHistory(site.id),
        ]);
        const stored=history[0]?.content ?? published?.content;
        const copy:SiteLocalContent=stored ? normalizeSiteLocalContent(stored,{allowIncompleteImage:true}) : {
          ...emptySiteLocalContent,
          heroHeadline:"A place to learn. A community to grow.",
          welcomeMessage:"Explore what this learning community could offer.",
          localDescription:"Our learning Site is taking shape. We are exploring educational experiences for our community.",
          branding:{...emptySiteLocalBranding,templateId:"modern" as const,paletteId:"brand-modern" as const},
        };
        const localContent={
          ...copy,
          branding:{
            ...copy.branding,
            heroImage:siteLocalImagePublicationGaps(copy.branding.heroImage).length?null:copy.branding.heroImage,
            logoImage:siteLocalImagePublicationGaps(copy.branding.logoImage??null).length?null:copy.branding.logoImage??null,
          },
        };
        const noncreditReleases=await readOptionalSiteNoncreditReleases(site.id);
        const classes=await readOptionalSitePublishedClasses(site.id);
        const page:PublicSitePage={
          host:publicSiteHost(publication.slug),
          site:{name:site.name,organizationName:site.organizationName},
          academicPrograms:academics,
          offerings:enrichment.map(toPublicSiteEnrichment),
          ...(noncreditReleases.length?{
            noncreditReleases,
            enrollmentAppOrigin:noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
          }:{}),
          localContent,
        };
        const parsed=siteLaunchPreferencesSchema.safeParse(site.metadata.launchPreferences);
        const location=schoolPlanningLocationSchema.safeParse(site.metadata.schoolPlanningLocation);
        // Read only exact-Site affiliations when the active operator is granted
        // network read authority. These are NEVER public brand claims.
        const networkRows=actor.capabilities.has("network.affiliations.read")
          ? await db.select({name:organizations.name,status:siteAffiliations.status})
              .from(siteAffiliations)
              .innerJoin(organizations,eq(organizations.id,siteAffiliations.denominationOrganizationId))
              .where(eq(siteAffiliations.siteId,site.id)).limit(20)
          : null;
        const networkAffiliations=networkRows?.flatMap(row =>
          (["pending","approved","rejected","revoked"] as const).includes(
            row.status as "pending"|"approved"|"rejected"|"revoked")
            ? [{name:row.name,status:row.status as "pending"|"approved"|"rejected"|"revoked"}]
            : []) ?? null;
        const config=safeReadSiteContentChannelConfig(site.metadata.websiteContentChannels);
        page.enrollmentOpportunities=projectSiteEnrollmentOpportunities({
          academicPrograms:academics,enrichment:page.offerings,
          noncredit:noncreditReleases,classes,
          enrollmentOrigin:noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
        });
        page.contentBlocks=resolveSiteContentBlocks(config,{
          mode:"private",
          preferences:parsed.success?parsed.data:null,
          siteSetup:{name:site.name,organizationName:site.organizationName,
            city:location.success?location.data.city:null,
            state:location.success?location.data.state:null,timezone:site.timezone},
          networkAffiliations,networkStatusKnown:networkRows!==null,
          academicPrograms:academics, enrichment:page.offerings,
          noncredit:noncreditReleases,classes,classTimezone:site.timezone,
          enrollmentOrigin:noncreditEnrollmentOrigin(process.env.CAN_ACCESS_PUBLIC_ORIGIN),
        });
        const availablePages=availablePublicSitePaths(page);
        if(!availablePages.includes(path))
          return failure(404,"Page not available","This Site has not published the data required for this preview page.");
        const rendered=renderPublicSiteHtml(page,{path,localPreview:true});
        const html=renderPrivateWebsitePreviewHtml(
          rendered,site.id,availablePages,Boolean(history.length),"site",
        );
        return new Response(html,{status:200,headers:siteFirstPreviewHeaders});
      }catch(error){
        if(error instanceof AuthorizationError)
          return failure(403,"Site preview access required","Your active account is not authorized for this Site.");
        console.error("Launch Site preview failed",{
          operation:"site_first_preview",errorType:error instanceof Error?error.name:"unknown",
        });
        return failure(503,"Site preview unavailable",
          "The Site website cannot be rendered right now. Your saved Site and plans are unchanged.");
      }
    },
  }},
});
