import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import { readPublishedSiteCatalog } from "@/modules/sites/site-public-catalog.server";
import { availablePublicSitePaths } from "@/domain/public-site-html";
import { publicSiteHost } from "@/domain/public-site-address";

export const publicDiscoveryInput = z.object({
  term: z.string().trim().max(100).default(""),
  category: z.enum(["all","school","community"]).default("all"),
  cursor: z.string().uuid().nullable().default(null),
}).strict();

type CatalogEntry = {
  id:string; title:string; description:string;
  category:"school"|"community"; status:string;
  destination:string; registrationOpen:boolean;
};
type PublicPlace = {
  slug:string; siteName:string; organizationName:string;
  city:string|null; region:string|null; siteUrl:string;
  programs:CatalogEntry[];
};

/** A keyset cursor refers only to a public Site publication, never a
 * membership/authorization grant. Server-side filtering must inspect the
 * provider-approved catalog, not unreviewed Program or draft records.
 *
 * The scan is bounded per request, but paging continues through the whole
 * published directory rather than stopping after the first 20 Sites.
 */
export const getMyCanDiscoverablePrograms = createServerFn({method:"GET"})
  .validator((value:unknown)=>publicDiscoveryInput.parse(value))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","public, max-age=30");
    const pageSize=12, batchSize=24, maxScanned=240;
    let after=data.cursor;
    let scanned=0;
    let exhausted=false;
    const locations:PublicPlace[]=[];
    const term=data.term.toLocaleLowerCase();
    while(locations.length<pageSize && scanned<maxScanned && !exhausted){
      const candidates=await db.select({
        id:sites.id, slug:sitePublications.slug,
        siteName:sites.name,address:sites.address,
      }).from(sitePublications)
        .innerJoin(sites,eq(sites.id,sitePublications.siteId))
        .where(and(
          eq(sitePublications.status,"published"),
          isNotNull(sitePublications.publishedAt),
          ...(after?[gt(sitePublications.siteId,after)]:[]),
        ))
        .orderBy(asc(sitePublications.siteId)).limit(batchSize);
      if(candidates.length===0)break;
      for(const site of candidates){
        after=site.id;
        scanned++;
        // Only the governed publication service decides which programs may
        // appear; never search internal raw curricula or private drafts.
        const catalog=await readPublishedSiteCatalog(site.slug);
        if(catalog && !catalog.demonstration){
          const pages=availablePublicSitePaths(catalog);
          const siteUrl=`https://${publicSiteHost(site.slug)}`;
          const academicDestination=pages.includes("/admissions")?
            siteUrl+"/admissions":siteUrl+"/";
          const communityDestination=pages.includes("/student-life")?
            siteUrl+"/student-life":siteUrl+"/";
          const programs:CatalogEntry[]=[
            ...catalog.academicPrograms.map(program=>({
              id:program.programId,title:program.title,
              description:program.summary,category:"school" as const,
              status:program.availability==="operating"?"Operating":"Planned",
              registrationOpen:program.applicationOpen===true,
              destination:academicDestination,
            })),
            ...catalog.offerings.map(offering=>({
              id:offering.seasonId,title:offering.title,
              description:`${offering.programName} · ${offering.season}`,
              category:"community" as const,
              status:offering.registrationOpen?"Registration open":"Registration unavailable",
              registrationOpen:offering.registrationOpen,
              destination:communityDestination,
            })),
          ];
          const city=typeof site.address?.city==="string"?site.address.city:null;
          const region=typeof site.address?.region==="string"?site.address.region:null;
          const filtered=programs.filter(p=>(
            data.category==="all"||p.category===data.category
          ) && (!term||[
            p.title,p.description,site.siteName,catalog.site.organizationName,city,region,
          ].some(value=>value?.toLocaleLowerCase().includes(term))));
          if(filtered.length)locations.push({
            slug:site.slug,siteName:site.siteName,
            organizationName:catalog.site.organizationName,
            city,region,siteUrl:siteUrl+"/",programs:filtered,
          });
        }
        if(locations.length===pageSize||scanned===maxScanned)break;
      }
      if(candidates.length<batchSize &&
        after===candidates[candidates.length-1]?.id)exhausted=true;
    }
    return {
      locations,nextCursor:exhausted?null:after,
      hasMore:!exhausted && after!==null,
      scanned, // Diagnostic, not a total-results estimate.
    };
  });
