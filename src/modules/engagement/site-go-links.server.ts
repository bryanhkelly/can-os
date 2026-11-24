import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { siteMarketingPackages, sites, organizations } from "@/db/schema";
import { requireCurrentNetworkAgreement } from "@/modules/networks/network-agreement.server";
import { readPublicGoLink, observePublicGoResponse, type PublicGoLink } from "./go-public-gateway.server";
import { goLinkAvailability } from "@/domain/go-link-policy";
import { executeSiteGoDestination, type SiteGoExecution } from "./go-destination-registry.server";

/** Public redirect resolution never grants access. Every operation checks
 * the current Site, optional package, lifecycle and authoritative destination.
 * A successful redirect is observed only as an aggregated daily count.
 */
export async function resolveSiteGoExperience(code: string, observe=true, page="/"): Promise<SiteGoExecution | null> {
  const link=await readPublicGoLink(code);
  return resolveLoadedSiteGoExperience(code,link,observe,page);
}
export async function resolveLoadedSiteGoExperience(code:string,link:PublicGoLink|null,observe=true,page="/"):Promise<SiteGoExecution|null>{
  if(!link || goLinkAvailability(link)!=="available" ||
      link.engagementVersionId || !link.siteId || !link.organizationId || !link.destination)return null;

  const [site]=await db.select({
    organizationId:sites.organizationId,lifecycleStatus:sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id,link.siteId)).limit(1);
  if(!site || site.organizationId!==link.organizationId ||
      site.lifecycleStatus==="closed")return null;
  const [organization]=await db.select({status:organizations.lifecycleStatus,type:organizations.type})
    .from(organizations).where(eq(organizations.id,link.organizationId)).limit(1);
  if(!organization||organization.status==="inactive"||organization.status==="closed")return null;
  if(organization.type==="denomination"){
    try{await requireCurrentNetworkAgreement(db,link.organizationId);}catch{return null;}
  }
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

  const outcome=await executeSiteGoDestination(link.siteId,link.destination,code,page);
  if(!outcome)return null;

  // Best-effort observational counter. No IP, cookie, headers, Person, unique
  // visitor claim, or fabricated enrollment. Metrics never block navigation.
  if(observe)await observePublicGoResponse(code,link.id,outcome.mode==="redirect"?"redirect":"page",page==="/");
  return outcome;
}

/** Compatibility for server-side consumers expecting only redirect targets. */
export async function resolveSiteGoLink(code:string,observe=true):Promise<string|null>{
  const outcome=await resolveSiteGoExperience(code,observe);
  return outcome?.mode==="redirect"?outcome.href:null;
}
