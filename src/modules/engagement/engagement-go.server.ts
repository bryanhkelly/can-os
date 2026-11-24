import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  engagementDefinitions, engagementDefinitionVersions, organizations,
  programs, siteGoLinks, siteGoLinkDailyVisits, sitePublications, sites,
} from "@/db/schema";
import {
  engagementDefinitionSchema, type EngagementDefinition,
} from "@/domain/engagement-definition";
import { goCodeSchema, goDestinationHref, type GoDestination } from "@/domain/site-go-links";
import { publicSiteHost } from "@/domain/public-site-address";
import { goLinkAvailability } from "@/domain/go-link-policy";
import { resolveSiteGoLink } from "./site-go-links.server";

export type GoExperience =
  | {mode:"redirect";href:string}
  | {mode:"page";definition:EngagementDefinition;href:string;ownerName:string};

async function publishedSiteHost(siteId:string|null):Promise<string|null>{
  if(!siteId)return null;
  const [publication]=await db.select({
    slug:sitePublications.slug,status:sitePublications.status,
    publishedAt:sitePublications.publishedAt,
  }).from(sitePublications).where(eq(sitePublications.siteId,siteId)).limit(1);
  if(!publication || publication.status!=="published" || !publication.publishedAt)return null;
  return publicSiteHost(publication.slug);
}
async function validOwner(
  owner:{ownerKind:string;organizationId:string|null;siteId:string|null;programId:string|null},
):Promise<{name:string;siteId:string|null}|null>{
  if(owner.ownerKind==="platform" && !owner.organizationId && !owner.siteId && !owner.programId)
    return {name:"Becomuna",siteId:null};
  if(!owner.organizationId)return null;
  const [organization]=await db.select({
    id:organizations.id,name:organizations.name,
    status:organizations.lifecycleStatus,
  }).from(organizations).where(eq(organizations.id,owner.organizationId)).limit(1);
  if(!organization || organization.status==="inactive" || organization.status==="closed")return null;
  if(owner.ownerKind==="organization" && !owner.siteId && !owner.programId)
    return {name:organization.name,siteId:null};
  if(owner.ownerKind==="site" && owner.siteId && !owner.programId){
    const [site]=await db.select({
      organizationId:sites.organizationId,name:sites.name,
      status:sites.lifecycleStatus,
    }).from(sites).where(eq(sites.id,owner.siteId)).limit(1);
    return site && site.organizationId===organization.id && site.status!=="closed"
      ? {name:site.name,siteId:owner.siteId}:null;
  }
  if(owner.ownerKind==="program" && owner.programId){
    const [program]=await db.select({
      organizationId:programs.organizationId,siteId:programs.siteId,name:programs.name,status:programs.status,
    }).from(programs).where(eq(programs.id,owner.programId)).limit(1);
    if(!program || program.organizationId!==organization.id || program.siteId!==owner.siteId || program.status==="closed")return null;
    if(program.siteId){
      const [site]=await db.select({
        organizationId:sites.organizationId,status:sites.lifecycleStatus,
      }).from(sites).where(eq(sites.id,program.siteId)).limit(1);
      if(!site || site.organizationId!==organization.id || site.status==="closed")return null;
    }
    return {name:program.name,siteId:program.siteId};
  }
  return null;
}

async function resolveDestination(
  destination:GoDestination,code:string,siteId:string|null,
):Promise<string|null>{
  const host=destination.kind==="site-page"?await publishedSiteHost(siteId):null;
  return goDestinationHref(destination,code,host);
}

/** One best-effort aggregate observation shared by direct and universal links.
 * Redirects include automated requests; an observation is not an identity.
 */
async function observeUniversalGoVisit(linkId:string):Promise<void>{
  try{
    await db.insert(siteGoLinkDailyVisits).values({
      linkId,day:new Date().toISOString().slice(0,10),redirects:1,
    }).onConflictDoUpdate({
      target:[siteGoLinkDailyVisits.linkId,siteGoLinkDailyVisits.day],
      set:{redirects:sql`${siteGoLinkDailyVisits.redirects}+1`},
    });
  }catch{
    console.error("Universal Go Link observation unavailable",{kind:"daily_counter"});
  }
}

/** Single public resolver; Site and universal engagement links share code store. */
export async function resolveGoExperience(code:string):Promise<GoExperience|null>{
  if(!goCodeSchema.safeParse(code).success)return null;
  const [link]=await db.select({
    id:siteGoLinks.id,
    startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
    destination:siteGoLinks.destination,status:siteGoLinks.status,
    siteId:siteGoLinks.siteId,organizationId:siteGoLinks.organizationId,
    engagementVersionId:siteGoLinks.engagementVersionId,
  }).from(siteGoLinks).where(eq(siteGoLinks.code,code)).limit(1);
  if(!link || goLinkAvailability(link)!=="available")return null;

  if(!link.engagementVersionId){
    // Reuse the destination registry that enforces exact Site ownership,
    // current publication, optional Marketing Package and program eligibility.
    const href=await resolveSiteGoLink(code);
    return href?{mode:"redirect",href}:null;
  }
  const [version]=await db.select({
    content:engagementDefinitionVersions.content,
    engagementId:engagementDefinitionVersions.engagementId,
  }).from(engagementDefinitionVersions)
    .where(eq(engagementDefinitionVersions.id,link.engagementVersionId)).limit(1);
  if(!version)return null;
  const [record]=await db.select().from(engagementDefinitions).where(and(
    eq(engagementDefinitions.id,version.engagementId),
    eq(engagementDefinitions.status,"active"),
  )).limit(1);
  if(!record || record.organizationId!==link.organizationId || record.siteId!==link.siteId)return null;
  const owner=await validOwner(record);
  if(!owner)return null;
  const parsed=engagementDefinitionSchema.safeParse(version.content);
  if(!parsed.success)return null;
  const definition=parsed.data;
  const destination=definition.execution.mode==="redirect"
    ? definition.execution.destination:definition.execution.action;
  const href=await resolveDestination(destination,code,owner.siteId);
  if(!href)return null;
  await observeUniversalGoVisit(link.id);
  return definition.execution.mode==="redirect"
    ? {mode:"redirect",href}
    : {mode:"page",definition,href,ownerName:owner.name};
}
