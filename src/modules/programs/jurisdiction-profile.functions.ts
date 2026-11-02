import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability } from "@/domain/command-context";
import { db } from "@/db/client";
import { jurisdictionProfileVersions, jurisdictions } from "@/db/schema";
import { and, eq, desc, inArray } from "drizzle-orm";

/**
 * Registrar-facing editorial read. Review records are never exposed through
 * public launch projections; only a published version can inform launch.
 */
export const listJurisdictionProfileReviews = createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 assertCapability(context,"program.read");
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
