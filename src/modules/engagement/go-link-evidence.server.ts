import { and, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteGoLinks, siteGoLinkDailyVisits } from "@/db/schema";
import { noncreditSelfEnrollmentClaims } from "@/db/canonical-v301";

/** These are two distinct metrics:
 * (1) observed redirects (NOT visitors or people),
 * (2) canonical noncredit enrollment claims carrying this exact referral code
 *     and matching the exact Site + training release (NOT causally proven).
 * No visitor/person/guardian IDs or raw requests enter the Go Link layer.
 */
export type GoLinkEvidence = {
  linkId:string; redirects30d:number;
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
  if(!links.length)return [];
  const now=new Date();
  const today=now.toISOString().slice(0,10);
  const start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-29));
  const firstDay=start.toISOString().slice(0,10);
  const tomorrow=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()+1));
  const traffic=await reader.select({
    linkId:siteGoLinkDailyVisits.linkId,
    visits:sql<string>`sum(${siteGoLinkDailyVisits.redirects})::text`,
  }).from(siteGoLinkDailyVisits).where(and(
    inArray(siteGoLinkDailyVisits.linkId,links.map(link=>link.id)),
    gte(siteGoLinkDailyVisits.day,firstDay),
    lte(siteGoLinkDailyVisits.day,today),
  )).groupBy(siteGoLinkDailyVisits.linkId);
  const visitsByLink=new Map(traffic.map(item=>[item.linkId,Number(item.visits)]));
  const referenced=links.filter(link=>link.destination?.kind==="adult-training");
  const claims=referenced.length?await reader.select({
    code:noncreditSelfEnrollmentClaims.referralCode,
    releaseId:noncreditSelfEnrollmentClaims.releaseId,
    claims:sql<string>`count(*)::text`,
  }).from(noncreditSelfEnrollmentClaims).where(and(
    eq(noncreditSelfEnrollmentClaims.siteId,siteId),
    inArray(noncreditSelfEnrollmentClaims.referralCode,
      referenced.map(link=>link.code)),
    gte(noncreditSelfEnrollmentClaims.createdAt,start),
    lt(noncreditSelfEnrollmentClaims.createdAt,tomorrow),
  )).groupBy(noncreditSelfEnrollmentClaims.referralCode,
    noncreditSelfEnrollmentClaims.releaseId):[];
  const claimsByKey=new Map(claims.map(item=>[
    item.code+":"+item.releaseId,Number(item.claims),
  ]));
  return links.map(link=>({
    linkId:link.id,redirects30d:visitsByLink.get(link.id)??0,
    referralRegistrations30d:link.destination.kind==="adult-training"
      ?claimsByKey.get(link.code+":"+link.destination.releaseId)??0:null,
    registrationEvidence:link.destination.kind==="adult-training"
      ?"referenced_noncredit_claim" as const:"not_connected" as const,
    observationQuality:"unfiltered_automated_traffic" as const,
    periodStart:firstDay,periodEnd:today,
  }));
}
