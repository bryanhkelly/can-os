import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { siteGoLinks, siteGoLinkDailyVisits, siteMarketingPackages, sites } from "@/db/schema";
import { goCodeSchema } from "@/domain/site-go-links";
import { goLinkAvailability } from "@/domain/go-link-policy";
import { inspectGoDestination } from "./go-destination-registry.server";

/** Public redirect resolution never grants access. Every operation checks
 * the current Site, optional package, lifecycle and authoritative destination.
 * A successful redirect is observed only as an aggregated daily count.
 */
export async function resolveSiteGoLink(code: string): Promise<string | null> {
  if (!goCodeSchema.safeParse(code).success) return null;
  const [link] = await db.select({
    id:siteGoLinks.id,destination:siteGoLinks.destination,status:siteGoLinks.status,
    startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
    siteId:siteGoLinks.siteId,organizationId:siteGoLinks.organizationId,
    packageId:siteGoLinks.packageId,
  }).from(siteGoLinks).where(eq(siteGoLinks.code,code)).limit(1);
  if(!link || goLinkAvailability(link)!=="available" ||
      !link.siteId || !link.organizationId || !link.destination)return null;

  const [site]=await db.select({
    organizationId:sites.organizationId,lifecycleStatus:sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id,link.siteId)).limit(1);
  if(!site || site.organizationId!==link.organizationId ||
      site.lifecycleStatus==="closed")return null;
  // An outreach plan is optional. The Site owns every code, including
  // direct Class/program links created outside the Introduce workflow.
  if(link.packageId){
    const [pkg]=await db.select({
      siteId:siteMarketingPackages.siteId,
      organizationId:siteMarketingPackages.organizationId,
    }).from(siteMarketingPackages)
      .where(eq(siteMarketingPackages.id,link.packageId)).limit(1);
    // Package archival is not implicit revocation of printed collateral.
    if(!pkg || pkg.siteId!==link.siteId ||
      pkg.organizationId!==link.organizationId)return null;
  }

  const outcome=await inspectGoDestination(link.siteId,link.destination,code);
  if(!outcome.available || !outcome.href)return null;

  // Best-effort observational counter. No IP, cookie, headers, Person, unique
  // visitor claim, or fabricated enrollment. Metrics never block navigation.
  try {
    const day=new Date().toISOString().slice(0,10);
    await db.insert(siteGoLinkDailyVisits).values({
      linkId:link.id,day,redirects:1,
    }).onConflictDoUpdate({
      target:[siteGoLinkDailyVisits.linkId,siteGoLinkDailyVisits.day],
      set:{redirects:sql`${siteGoLinkDailyVisits.redirects} + 1`},
    });
  }catch{
    console.error("Go Link aggregate observation unavailable",{kind:"daily_counter"});
  }
  return outcome.href;
}
