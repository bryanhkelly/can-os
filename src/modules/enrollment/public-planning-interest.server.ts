import { createHmac } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  sitePublications, sitePublicationReleases, siteBlueprintApprovedVersions, siteProspectusInterests,
} from "@/db/schema";
import { publicProspectusSchema } from "@/domain/school-blueprint-approval";
import { isPublicSiteSlug } from "@/domain/public-site-address";
import { emitEvent } from "@/platform/mutation";

/** Adult-only Site concept interest; never an application or enrollment. */
export const publicPlanningInterestInput=z.object({
  interestMode:z.literal("planning"),
  requestId:z.string().uuid(),
  firstName:z.string().trim().min(1).max(80).refine(s=>!/[<>\r\n]/.test(s)),
  lastName:z.string().trim().min(1).max(80).refine(s=>!/[<>\r\n]/.test(s)),
  email:z.string().trim().toLowerCase().email().max(254),
  interestSubject:z.string().regex(/^(program|item):[a-f0-9-]{36}$/i).or(z.literal("")),
  contactConsent:z.literal("yes"),
  website:z.string().max(150).default(""),
}).strict();
export type PublicPlanningInterestInput=z.infer<typeof publicPlanningInterestInput>;
export function parsePublicPlanningInterest(params:URLSearchParams):PublicPlanningInterestInput{
  return publicPlanningInterestInput.parse(Object.fromEntries(params.entries()));
}
export async function recordPublicPlanningInterest(slug:string,input:PublicPlanningInterestInput):Promise<void>{
 if(!isPublicSiteSlug(slug))throw new Error("Unavailable school");
 const data=publicPlanningInterestInput.parse(input);
 if(data.website.trim())return; // Honeypot; do not retain bot data.
 const pepper=process.env.CAN_ACCESS_TOKEN_PEPPER;
 if(!pepper||pepper.length<32)throw new Error("Public interest security unavailable");
 await db.transaction(async tx=>{
  const [site]=await tx.select({siteId:sitePublications.siteId})
    .from(sitePublications).where(and(
     eq(sitePublications.slug,slug),eq(sitePublications.status,"published"),
     isNotNull(sitePublications.publishedAt))).for("share").limit(1);
  if(!site)throw new Error("This school is not collecting planning interest");
  const [release]=await tx.select({snapshot:sitePublicationReleases.contentSnapshot,
    source:sitePublicationReleases.sourceRevisionMap})
   .from(sitePublicationReleases).where(and(
    eq(sitePublicationReleases.siteId,site.siteId),
    eq(sitePublicationReleases.mode,"planning_prospectus"),
    eq(sitePublicationReleases.status,"published"),
    isNotNull(sitePublicationReleases.publishedAt),
    isNotNull(sitePublicationReleases.reviewedByPersonId)))
   .orderBy(desc(sitePublicationReleases.revision)).limit(1);
  if(!release)throw new Error("Planning prospectus unavailable");
  const [latest]=await tx.select({version:siteBlueprintApprovedVersions.version})
   .from(siteBlueprintApprovedVersions).where(eq(siteBlueprintApprovedVersions.siteId,site.siteId))
   .orderBy(desc(siteBlueprintApprovedVersions.version)).limit(1);
  const source=release.source as {canApprovalVersion?:number|null};
  if((source.canApprovalVersion??null)!==(latest?.version??null))
   throw new Error("Prospectus is under review");
  const published=publicProspectusSchema.parse(release.snapshot);
  const [subjectKind,subjectId]=data.interestSubject?data.interestSubject.split(":"):[null,null];
  if(subjectKind&&subjectId&&!published.items.some(item=>item.sourceKind===subjectKind&&item.sourceId===subjectId))
   throw new Error("Choose an experience listed on this school prospectus");
  const emailDigest=createHmac("sha256",pepper)
   .update("planning-interest:").update(site.siteId).update(":").update(data.email).digest("hex");
  const [saved]=await tx.insert(siteProspectusInterests).values({
   siteId:site.siteId,requestId:data.requestId,
   firstName:data.firstName,lastName:data.lastName,emailNormalized:data.email,emailDigest,
   subjectKind:subjectKind??null,subjectId:subjectId??null,
   contactConsentAt:new Date(),
  }).onConflictDoNothing().returning({id:siteProspectusInterests.id});
  if(saved)await emitEvent(tx,{eventType:"SchoolPlanningInterestReceived",
   aggregateType:"SitePlanningInterest",aggregateId:saved.id,siteId:site.siteId,
   payload:{subjectKind,subjectId,kind:"adult_interest_only"}});
 });
}
