import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteGoLinks, siteGoLinkDailyVisits, sites } from "@/db/schema";
import type { GoDestination } from "@/domain/site-go-links";
import { noncreditSelfEnrollmentReleases, noncreditSelfEnrollmentClaims } from "@/db/canonical-v301";

/** Traffic counts and registration claims are separate evidence families:
 * (1) successful classified entries, rendered pages, redirects and legacy entries (NOT visitors or people),
 * (2) canonical noncredit enrollment claims carrying this exact referral code
 *     and matching the exact Site + training release (NOT causally proven).
 * No visitor/person/guardian IDs or raw requests enter the Go Link layer.
 */
export type GoLinkEvidence = {
  linkId:string; redirects30d:number; // Deprecated mixed entry count, retained for existing clients.
  linkOpens30d:number; pageViews30d:number; redirectResponses30d:number; unclassifiedEntries30d:number;
  referralRegistrations30d:number|null;
  registrationEvidence:"referenced_noncredit_claim"|"not_connected";
  observationQuality:"unfiltered_automated_traffic";
  periodStart:string;periodEnd:string;
};

export async function readSiteGoLinkEvidence(
  siteId:string,packageId:string|undefined,reader:Pick<typeof db,"select">=db,
  linkIds:readonly string[]|undefined=undefined,
):Promise<GoLinkEvidence[]>{
  if(linkIds && linkIds.length===0)return [];
  const links=await reader.select({
    id:siteGoLinks.id,code:siteGoLinks.code,destination:siteGoLinks.destination,
  }).from(siteGoLinks).where(and(eq(siteGoLinks.siteId,siteId),
    isNull(siteGoLinks.engagementVersionId),
    packageId?eq(siteGoLinks.packageId,packageId):undefined,
    linkIds?inArray(siteGoLinks.id,[...linkIds]):undefined,
  )).orderBy(desc(siteGoLinks.createdAt),desc(siteGoLinks.id)).limit(500);
  return readAuthorizedGoLinkEvidence(links.map(link=>({...link,siteId})),reader);
}

/** Call only with rows selected by a separately authorized owner query. */
export async function readAuthorizedGoLinkEvidence(
  links:readonly {id:string;code:string;destination:GoDestination|null;siteId:string|null;organizationId?:string|null}[],
  reader:Pick<typeof db,"select">=db,
):Promise<GoLinkEvidence[]>{
  if(!links.length)return [];
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-29));
  const firstDay=start.toISOString().slice(0,10);
  const tomorrow=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
  const traffic=await reader.select({
    linkId:siteGoLinkDailyVisits.linkId,
    visits:sql<string>`sum(${siteGoLinkDailyVisits.redirects})::text`,
    opens:sql<string>`sum(${siteGoLinkDailyVisits.linkOpens})::text`,
    views:sql<string>`sum(${siteGoLinkDailyVisits.pageViews})::text`,
    redirects:sql<string>`sum(${siteGoLinkDailyVisits.redirectResponses})::text`,
  }).from(siteGoLinkDailyVisits).where(and(
    inArray(siteGoLinkDailyVisits.linkId,links.map(link=>link.id)),
    gte(siteGoLinkDailyVisits.day,firstDay),
    lte(siteGoLinkDailyVisits.day,today),
  )).groupBy(siteGoLinkDailyVisits.linkId);
  const visitsByLink=new Map(traffic.map(item=>[item.linkId,item]));
  const referenced=links.flatMap(link=>link.destination?.kind==="adult-training"
    ?[{...link,releaseId:link.destination.releaseId}]:[]);
  const releaseIds=[...new Set(referenced.map(link=>link.releaseId))];
  const releases=releaseIds.length?await reader.select({id:noncreditSelfEnrollmentReleases.id,siteId:noncreditSelfEnrollmentReleases.siteId})
    .from(noncreditSelfEnrollmentReleases).where(inArray(noncreditSelfEnrollmentReleases.id,releaseIds)):[];
  const sitesByRelease=new Map(releases.map(row=>[row.id,row.siteId]));
  const releaseSiteIds=[...new Set(releases.map(row=>row.siteId))];
  const owners=releaseSiteIds.length?await reader.select({id:sites.id,organizationId:sites.organizationId}).from(sites).where(inArray(sites.id,releaseSiteIds)):[];
  const orgBySite=new Map(owners.map(site=>[site.id,site.organizationId]));
  const connected=referenced.filter(link=>{
    const site=sitesByRelease.get(link.releaseId);
    return !!site&&(!link.siteId||site===link.siteId)&&
      (!link.organizationId||orgBySite.get(site)===link.organizationId);
  });
  const byLink=new Map(connected.map(link=>[link.id,link]));
  const claims=connected.length?await reader.select({
    code:noncreditSelfEnrollmentClaims.referralCode,
    releaseId:noncreditSelfEnrollmentClaims.releaseId,
    siteId:noncreditSelfEnrollmentClaims.siteId,
    claims:sql<string>`count(*)::text`,
  }).from(noncreditSelfEnrollmentClaims).where(and(
    inArray(noncreditSelfEnrollmentClaims.releaseId,connected.map(link=>link.releaseId)),
    inArray(noncreditSelfEnrollmentClaims.referralCode,
      connected.map(link=>link.code)),
    gte(noncreditSelfEnrollmentClaims.createdAt,start),
    lt(noncreditSelfEnrollmentClaims.createdAt,tomorrow),
  )).groupBy(noncreditSelfEnrollmentClaims.referralCode,
    noncreditSelfEnrollmentClaims.releaseId,noncreditSelfEnrollmentClaims.siteId):[];
  const claimsByKey=new Map(claims.map(item=>[
    item.code+":"+item.releaseId+":"+item.siteId,Number(item.claims),
  ]));
  return links.map(link=>({
    linkId:link.id,redirects30d:Number(visitsByLink.get(link.id)?.visits??0),
    linkOpens30d:Number(visitsByLink.get(link.id)?.opens??0),
    pageViews30d:Number(visitsByLink.get(link.id)?.views??0),
    redirectResponses30d:Number(visitsByLink.get(link.id)?.redirects??0),
    unclassifiedEntries30d:Math.max(0,Number(visitsByLink.get(link.id)?.visits??0)-Number(visitsByLink.get(link.id)?.opens??0)),
    referralRegistrations30d:byLink.has(link.id)
      ?claimsByKey.get(link.code+":"+byLink.get(link.id)!.releaseId+":"+sitesByRelease.get(byLink.get(link.id)!.releaseId))??0:null,
    registrationEvidence:byLink.has(link.id)
      ?"referenced_noncredit_claim" as const:"not_connected" as const,
    observationQuality:"unfiltered_automated_traffic" as const,
    periodStart:firstDay,periodEnd:today,
  }));
}
