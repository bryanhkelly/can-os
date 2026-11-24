import { requireCurrentNetworkAgreement } from "@/modules/networks/network-agreement.server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  engagementDefinitions, engagementDefinitionVersions, organizations,
  programs, siteGoLinks, siteGoLinkDailyVisits, siteBrandVersions, sites,
} from "@/db/schema";
import {
  engagementDefinitionSchema, type EngagementDefinition,
} from "@/domain/engagement-definition";
import { sitePreviewSnapshotKey, readSitePreviewSnapshot } from "@/platform/storage/site-preview-snapshots.server";
import { renderSharedSitePreview } from "@/domain/site-preview-sharing";
import { isPublicSitePagePath } from "@/domain/public-site-paths";
import { goCodeSchema } from "@/domain/site-go-links";
import { inspectEngagementDestination } from "./go-destination-registry.server";
import { siteBrandConfigurationSchema } from "@/domain/site-brand";
import { resolveSiteTheme, type SiteTheme } from "@/domain/site-theme";
import { goLinkAvailability } from "@/domain/go-link-policy";
import { resolveSiteGoLink } from "./site-go-links.server";

export type GoExperience =
  | {mode:"website-preview";html:string}
  | {mode:"redirect";href:string}
  | {mode:"page";definition:EngagementDefinition;href:string;ownerName:string;theme?:SiteTheme|null};

/** Use only a stored, same-Site, immutable Brand version. No caller CSS or external fonts. */
async function publishedExperienceBrand(
  siteId:string|null,brandVersionId:string|undefined,
):Promise<{name:string;theme:SiteTheme}|null>{
  if(!siteId||!brandVersionId)return null;
  const [row]=await db.select({configuration:siteBrandVersions.configuration})
    .from(siteBrandVersions).where(and(
      eq(siteBrandVersions.siteId,siteId),
      eq(siteBrandVersions.id,brandVersionId),
    )).limit(1);
  if(!row)return null;
  const parsed=siteBrandConfigurationSchema.safeParse(row.configuration);
  if(!parsed.success)return null;
  const brand=parsed.data;
  return {
    name:brand.displayName,
    theme:resolveSiteTheme(
      brand.paletteId,brand.typographyId,
      brand.headingFontId??undefined,brand.bodyFontId??undefined,
    ),
  };
}
async function validOwner(
  owner:{ownerKind:string;organizationId:string|null;siteId:string|null;programId:string|null},
):Promise<{name:string;siteId:string|null}|null>{
  if(owner.ownerKind==="platform" && !owner.organizationId && !owner.siteId && !owner.programId)
    return {name:"Becomuna",siteId:null};
  if(!owner.organizationId)return null;
  const [organization]=await db.select({
    id:organizations.id,name:organizations.name,type:organizations.type,
    status:organizations.lifecycleStatus,
  }).from(organizations).where(eq(organizations.id,owner.organizationId)).limit(1);
  if(!organization || organization.status==="inactive" || organization.status==="closed")return null;
  if(organization.type==="denomination"){try{await requireCurrentNetworkAgreement(db,organization.id);}catch{return null;}}
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
export async function resolveGoExperience(code:string,page:string="/",observe=true):Promise<GoExperience|null>{
  if(!goCodeSchema.safeParse(code).success)return null;
  const [link]=await db.select({
    id:siteGoLinks.id,
    startsAt:siteGoLinks.startsAt,expiresAt:siteGoLinks.expiresAt,
    destination:siteGoLinks.destination,status:siteGoLinks.status,
    siteId:siteGoLinks.siteId,organizationId:siteGoLinks.organizationId,
    engagementVersionId:siteGoLinks.engagementVersionId,
  }).from(siteGoLinks).where(eq(siteGoLinks.code,code)).limit(1);
  if(!link || goLinkAvailability(link)!=="available")return null;

  if(!link.engagementVersionId && link.destination?.kind==="website-preview"){
    if(!link.siteId||!link.organizationId||!isPublicSitePagePath(page))return null;
    const [site]=await db.select({organizationId:sites.organizationId,status:sites.lifecycleStatus}).from(sites).where(eq(sites.id,link.siteId)).limit(1);
    if(!site||site.organizationId!==link.organizationId||site.status==="closed")return null;
    const destination=link.destination;
    const pages=await readSitePreviewSnapshot(sitePreviewSnapshotKey(link.siteId,destination.snapshotId),destination.snapshotDigest);
    const html=pages?.[page];
    if(!pages||!html)return null;
    if(observe&&page==="/")await observeUniversalGoVisit(link.id);
    return {mode:"website-preview",html:renderSharedSitePreview(html,link.siteId,"",Object.keys(pages),false,code)};
  }
  if(!link.engagementVersionId){
    // Reuse the destination registry that enforces exact Site ownership,
    // current publication, optional Marketing Package and program eligibility.
    const href=await resolveSiteGoLink(code,observe);
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
  const result=await inspectEngagementDestination({
    ownerKind:record.ownerKind,
    organizationId:record.organizationId,
    siteId:record.siteId,
    programId:record.programId,
  },destination,code);
  if(!result.available||!result.href)return null;
  const href=result.href;
  if(observe)await observeUniversalGoVisit(link.id);
  if(definition.execution.mode==="redirect")return {mode:"redirect",href};
  const identity=await publishedExperienceBrand(
    owner.siteId,definition.presentation.brandVersionId,
  );
  return {mode:"page",definition,href,
    ownerName:identity?.name??owner.name,theme:identity?.theme??null};
}

/** Referral is optional attribution, never access. Reuse current destination
 * resolution without recording a second visit or trusting a caller's code. */
export async function verifyNoncreditGoReferral(code:string|undefined,releaseId:string):Promise<string|null>{
  if(!code||!goCodeSchema.safeParse(code).success)return null;
  try{
    const resolved=await resolveGoExperience(code,"/",false);
    if(!resolved||resolved.mode==="website-preview")return null;
    const expected="/learn/enroll?release="+encodeURIComponent(releaseId)+"&ref="+encodeURIComponent(code);
    return resolved.href===expected?code:null;
  }catch{return null;}
}
