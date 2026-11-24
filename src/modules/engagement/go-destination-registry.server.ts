import { and, desc, eq, ilike } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import { canonicalClasses, canonicalClassOfferingVersions } from "@/db/canonical-v301";
import { readEligibleSelfEnrollmentReleases } from "@/modules/enrollment/noncredit-self-enrollment-catalog.server";
import { readEnrichmentCatalog } from "@/modules/activities/enrichment-catalog.server";
import { publicSiteHost } from "@/domain/public-site-address";
import { engagementJourneys } from "@/domain/engagement-journeys";
import { goDestinationHref, type GoDestination } from "@/domain/site-go-links";
import { goLikeContainsLiteral } from "@/domain/go-link-search";

/** Shared canonical Destination Registry for Link Management, public resolution
 * and the operator picker. No duplicate publication rules or open redirects.
 */
export type GoDestinationChoice = {
  destination: GoDestination; title: string; description: string;
};
export type DestinationInspection = {
  available: boolean; title: string; href: string | null;
};
type Reader = Pick<typeof db,"select">;
const unavailable:DestinationInspection={available:false,title:"Unavailable",href:null};

async function publishedSiteHost(siteId:string,reader:Reader):Promise<string|null> {
  const [published]=await reader.select({
    slug:sitePublications.slug,status:sitePublications.status,
    publishedAt:sitePublications.publishedAt,
  }).from(sitePublications).where(eq(sitePublications.siteId,siteId)).limit(1);
  if(!published || published.status!=="published" || !published.publishedAt)return null;
  return publicSiteHost(published.slug);
}

/** Resolver and composer call the same publication/ownership checks.
 * Destination services remain authoritative for enrollment and seat allocation.
 * A link grants navigation only, not a participant, staff or guardian role.
 */
export async function inspectGoDestination(
  siteId:string,destination:GoDestination,code:string,
  reader:Reader=db,
):Promise<DestinationInspection>{
  if(destination.kind==="site-page"){
    const host=await publishedSiteHost(siteId,reader);
    const href=host?goDestinationHref(destination,code,host):null;
    return href?{available:true,href,title:destination.page==="home"?"Site homepage":destination.page}:unavailable;
  }
  if(destination.kind==="adult-training"){
    const releases=await readEligibleSelfEnrollmentReleases(reader,destination.releaseId);
    const release=releases[0];
    if(!release || release.siteId!==siteId)return unavailable;
    const href=goDestinationHref(destination,code);
    return href?{available:true,title:release.title,href}:unavailable;
  }
  if(destination.kind==="class"){
    const [row]=await reader.select({
      siteId:canonicalClasses.siteId, title:canonicalClasses.title,
      state:canonicalClasses.state,
      versionState:canonicalClassOfferingVersions.state,
      visibility:canonicalClassOfferingVersions.visibility,
      opensAt:canonicalClassOfferingVersions.opensAt,
      closesAt:canonicalClassOfferingVersions.closesAt,
    }).from(canonicalClasses)
      .innerJoin(canonicalClassOfferingVersions,
        eq(canonicalClassOfferingVersions.classId,canonicalClasses.id))
      .where(eq(canonicalClasses.id,destination.classId))
      .orderBy(desc(canonicalClassOfferingVersions.versionNo)).limit(1);
    const now=new Date();
    if(!row || row.siteId!==siteId || row.state!=="active" ||
      row.versionState!=="published" || row.visibility!=="public" ||
      (row.opensAt && row.opensAt>now) || (row.closesAt && row.closesAt<=now))
      return unavailable;
    const href=goDestinationHref(destination,code);
    return href?{available:true,title:row.title,href}:unavailable;
  }
  if(destination.kind==="enrichment"){
    // This catalog is already governed by extended-season approvals,
    // publication evidence, availability and registration checks.
    const current=await readEnrichmentCatalog(siteId,reader,destination.seasonId);
    const season=current.find(item=>item.seasonId===destination.seasonId);
    if(!season || !season.registrationOpen)return unavailable;
    const href=goDestinationHref(destination,code);
    return href?{available:true,title:season.name+" · "+season.seasonName,href}:unavailable;
  }
  if(destination.kind==="information"){
    const journey=Object.values(engagementJourneys)
      .find(item=>item.id===destination.journeyId);
    const href=journey?goDestinationHref(destination,code):null;
    return href&&journey?{available:true,title:journey.headline,href}:unavailable;
  }
  return unavailable;
}

/** Bounded, published-only options. Scope is ALWAYS checked by the caller
 * before this data is returned to an operator.
 */
export async function listGoDestinationChoices(
  siteId:string,kind:GoDestination["kind"],reader:Reader=db,term?:string,
):Promise<GoDestinationChoice[]>{
  if(kind==="site-page"){
    if(!await publishedSiteHost(siteId,reader))return [];
    const pages=["contact","home","programs","experiences","courses","classes","academics","admissions"] as const;
    return pages.map(page=>({destination:{kind:"site-page" as const,page},
      title:page==="contact"?"Express interest / Contact":page==="home"?"Site homepage":page[0]!.toUpperCase()+page.slice(1),
      description:"Published Site page"}))
      .filter(item=>!term || item.title.toLowerCase().includes(term.toLowerCase()));
  }
  if(kind==="information"){
    return Object.values(engagementJourneys).map(journey=>({
      destination:{kind:"information" as const,journeyId:journey.id},
      title:journey.headline,description:journey.audience,
    })).filter(item=>!term||[item.title,item.description].some(value=>
      value.toLowerCase().includes(term.toLowerCase())));
  }
  if(kind==="adult-training"){
    const releases=await readEligibleSelfEnrollmentReleases(reader,undefined,{siteId,limit:50,term});
    return releases.filter(item=>item.siteId===siteId).map(item=>({
      destination:{kind:"adult-training" as const,releaseId:item.id},
      title:item.title,description:item.deliveryMode==="facilitated"?"Facilitated training":"Independent training",
    }));
  }
  if(kind==="enrichment"){
    const seasons=await readEnrichmentCatalog(siteId,reader,undefined,term);
    return seasons.filter(item=>item.registrationOpen).slice(0,50).map(item=>({
      destination:{kind:"enrichment" as const,seasonId:item.seasonId},
      title:item.name+" · "+item.seasonName,description:"Open registration",
    }));
  }
  const versions=await reader.select({
    id:canonicalClasses.id,siteId:canonicalClasses.siteId,title:canonicalClasses.title,
    state:canonicalClasses.state,visibility:canonicalClassOfferingVersions.visibility,
    versionState:canonicalClassOfferingVersions.state,
    opensAt:canonicalClassOfferingVersions.opensAt,
    closesAt:canonicalClassOfferingVersions.closesAt,
  }).from(canonicalClasses).innerJoin(canonicalClassOfferingVersions,
    eq(canonicalClassOfferingVersions.classId,canonicalClasses.id))
    .where(and(eq(canonicalClasses.siteId,siteId),eq(canonicalClasses.state,"active"),
      term?ilike(canonicalClasses.title,goLikeContainsLiteral(term)):undefined))
    .orderBy(desc(canonicalClassOfferingVersions.versionNo)).limit(200);
  const latest=new Map<string,(typeof versions)[number]>();
  for(const version of versions)if(!latest.has(version.id))latest.set(version.id,version);
  const now=new Date();
  return [...latest.values()].filter(item=>
    item.state==="active" && item.visibility==="public" &&
    item.versionState==="published" &&
    (!item.opensAt || item.opensAt<=now) &&
    (!item.closesAt || item.closesAt>now),
  ).slice(0,50).map(item=>({
    destination:{kind:"class" as const,classId:item.id},title:item.title,
    description:"Public Class offering",
  }));
}

/** Minimal persisted parent scope. The authenticated author has already been
 * checked when publishing, but public resolution must check the CURRENT
 * owner and public availability again. A typed link alone never grants access.
 */
export type EngagementTargetOwner={
  ownerKind:"platform"|"organization"|"site"|"program";
  organizationId:string|null;
  siteId:string|null;
  programId:string|null;
};

/** Resolve public destination under the published engagement's owning scope.
 * Reuse the original Go registry so new journeys cannot weaken publish gates.
 * National Organization links may target an existing published release at one
 * of that Organization's own Sites, without manufacturing a Marketing Package.
 */
export async function inspectEngagementDestination(
  owner:EngagementTargetOwner,destination:GoDestination,code:string,reader:Reader=db,
):Promise<DestinationInspection>{
  if(destination.kind==="information"){
    const journey=Object.values(engagementJourneys).find(v=>v.id===destination.journeyId);
    const href=journey?goDestinationHref(destination,code):null;
    return href?{available:true,href,title:journey!.headline}:unavailable;
  }
  let targetSiteId:string|null=owner.siteId;
  if(!targetSiteId){
    if(owner.ownerKind!=="platform" && owner.ownerKind!=="organization")return unavailable;
    if(destination.kind==="site-page")return unavailable;
    if(destination.kind==="adult-training"){
      const releases=await readEligibleSelfEnrollmentReleases(reader,destination.releaseId);
      targetSiteId=releases[0]?.siteId??null;
    }else if(destination.kind==="enrichment"){
      const seasons=await readEnrichmentCatalog(undefined,reader,destination.seasonId);
      targetSiteId=seasons.find(v=>v.seasonId===destination.seasonId)?.siteId??null;
    }else if(destination.kind==="class"){
      const [cls]=await reader.select({siteId:canonicalClasses.siteId})
        .from(canonicalClasses).where(eq(canonicalClasses.id,destination.classId)).limit(1);
      targetSiteId=cls?.siteId??null;
    }
  }
  if(!targetSiteId)return unavailable;
  const [site]=await reader.select({
    organizationId:sites.organizationId,status:sites.lifecycleStatus,
  }).from(sites).where(eq(sites.id,targetSiteId)).limit(1);
  if(!site || site.status==="closed" ||
      (owner.organizationId!==null && site.organizationId!==owner.organizationId))
    return unavailable;
  if(owner.siteId && targetSiteId!==owner.siteId)return unavailable;
  // The original catalog enforces exact current Site, release publication,
  // seat windows, guardian registration policy and Class visibility.
  const inspected=await inspectGoDestination(targetSiteId,destination,code,reader);
  if(!inspected.available)return unavailable;
  if(owner.programId && destination.kind==="enrichment"){
    const seasons=await readEnrichmentCatalog(targetSiteId,reader,destination.seasonId);
    if(!seasons.some(s=>s.seasonId===destination.seasonId && s.programId===owner.programId))
      return unavailable;
  }
  return inspected;
}
