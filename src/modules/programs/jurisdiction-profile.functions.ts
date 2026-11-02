import { z } from "zod";
import { jurisdictionProfileSchema } from "@/domain/jurisdiction-profile";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
import { db } from "@/db/client";
import { writeAudit } from "@/platform/mutation";
import { jurisdictionProfileVersions, jurisdictions } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

/**
 * Registrar-facing editorial read. Review records are never exposed through
 * public launch projections; only a published version can inform launch.
 */
export const listJurisdictionProfileReviews = createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 assertCapability(context,"jurisdiction.profile.manage");
 const rows=await db.select({
  id:jurisdictionProfileVersions.id,
  jurisdictionId:jurisdictions.id,
  code:jurisdictions.code,
  name:jurisdictions.name,
  revision:jurisdictionProfileVersions.revision,
  status:jurisdictionProfileVersions.status,
  verificationStatus:jurisdictionProfileVersions.verificationStatus,
  title:jurisdictionProfileVersions.title,
  summary:jurisdictionProfileVersions.summary,
  profile:jurisdictionProfileVersions.profile,
  evidence:jurisdictionProfileVersions.evidence,
  reviewedAt:jurisdictionProfileVersions.reviewedAt,
  nextReviewAt:jurisdictionProfileVersions.nextReviewAt,
  publishedAt:jurisdictionProfileVersions.publishedAt,
 }).from(jurisdictionProfileVersions)
 .innerJoin(jurisdictions,eq(jurisdictions.id,jurisdictionProfileVersions.jurisdictionId))
 .where(inArray(jurisdictionProfileVersions.status,["draft","in_review","published"]))
 .orderBy(jurisdictions.name,desc(jurisdictionProfileVersions.createdAt));
 return rows;
});

export const listPublishedJurisdictionGuidance = createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 assertCapability(context,"program.read");
 const rows=await db.select({
  jurisdictionId:jurisdictionProfileVersions.jurisdictionId,
  summary:jurisdictionProfileVersions.summary,
  profile:jurisdictionProfileVersions.profile,
  verificationStatus:jurisdictionProfileVersions.verificationStatus,
  publishedAt:jurisdictionProfileVersions.publishedAt,
 }).from(jurisdictionProfileVersions).where(and(
  eq(jurisdictionProfileVersions.status,"published"),
  eq(jurisdictionProfileVersions.verificationStatus,"verified"),
 )).orderBy(desc(jurisdictionProfileVersions.publishedAt));
 const byJurisdiction:Record<string,{summary:string;publishedAt:string|null}>={};
 for(const row of rows){
  if(byJurisdiction[row.jurisdictionId])continue;
  byJurisdiction[row.jurisdictionId]={summary:row.summary,publishedAt:row.publishedAt?.toISOString()??null};
 }
 return byJurisdiction;
});

/** Only authorized operators can update an editorial draft. Published versions
 * are immutable; publication requires a separate, independently reviewed gate. */
const reviewInput=z.object({
 id:z.string().uuid(),
 title:z.string().trim().min(3).max(250),
 summary:z.string().trim().min(10).max(4000),
 profile:z.record(z.string(),z.unknown()),
 evidence:z.array(z.object({
  title:z.string().min(1),
  url:z.string().url().refine(value=>value.startsWith("https://"),"HTTPS required"),
  authority:z.string().min(1),
  checkedAt:z.string().datetime(),
 })),
});
export const saveJurisdictionProfileReview=createServerFn({method:"POST"})
 .validator((value:unknown)=>reviewInput.parse(value))
 .handler(async({data})=>{
  const context=await getCommandContext(getRequest());
  assertCapability(context,"jurisdiction.profile.manage");
  jurisdictionProfileSchema.parse({...data.profile,summary:data.summary,evidence:data.evidence});
  const [existing]=await db.select({status:jurisdictionProfileVersions.status})
   .from(jurisdictionProfileVersions).where(eq(jurisdictionProfileVersions.id,data.id)).limit(1);
  if(!existing || !["draft","in_review"].includes(existing.status))throw Error("Only unpublished reviews can be edited");
  const saved=await db.transaction(async tx=>{
   const [updated]=await tx.update(jurisdictionProfileVersions).set({
   title:data.title,summary:data.summary,profile:data.profile,evidence:data.evidence,
   updatedAt:new Date(),
  }).where(and(eq(jurisdictionProfileVersions.id,data.id),inArray(jurisdictionProfileVersions.status,["draft","in_review"])))
   .returning({id:jurisdictionProfileVersions.id});
   if(!updated)throw Error("Review was changed concurrently; reload and try again");
   await writeAudit(tx,context,{action:"jurisdiction.profile.review.updated",entityType:"jurisdiction_profile_version",entityId:updated.id,after:{title:data.title,summary:data.summary,evidenceCount:data.evidence.length}});
   return updated;
  });
  return {id:saved.id};
 });

/** Publish a reviewed profile only when official sources have been recorded. */
export const publishJurisdictionProfile=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({id:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const context=await getCommandContext(getRequest());
  assertCapability(context,"jurisdiction.profile.manage");
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(jurisdictionProfileVersions)
    .where(eq(jurisdictionProfileVersions.id,data.id)).limit(1);
   if(!record || record.status!=="in_review")throw Error("Profile must be in review before publication");
   const sources=record.evidence;
   jurisdictionProfileSchema.parse({...record.profile,summary:record.summary,evidence:sources});
   if(!Array.isArray(sources)||sources.length===0)throw Error("Add authoritative sources before publishing");
   for(const source of sources){
    if(!source || typeof source!=="object" || typeof source.url!=="string" || !source.url.startsWith("https://") || !source.authority || !source.checkedAt)
     throw Error("Each source needs an HTTPS URL, authority, and checked date");
   }
   const [published]=await tx.update(jurisdictionProfileVersions).set({
    status:"published",verificationStatus:"verified",reviewedAt:new Date(),
    publishedAt:new Date(),updatedAt:new Date(),
   }).where(and(eq(jurisdictionProfileVersions.id,data.id),eq(jurisdictionProfileVersions.status,"in_review")))
    .returning({id:jurisdictionProfileVersions.id});
   if(!published)throw Error("Profile was modified; reload and retry");
   await writeAudit(tx,context,{action:"jurisdiction.profile.published",entityType:"jurisdiction_profile_version",entityId:published.id,after:{revision:record.revision,sourceCount:sources.length}});
   return {id:published.id};
  });
 });
