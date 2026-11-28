import { z } from "zod";
import {
 jurisdictionProfileSchema, isJurisdictionProfileVerificationEvidenceCurrent,
} from "@/domain/jurisdiction-profile";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { db } from "@/db/client";
import { writeAudit } from "@/platform/mutation";
import {
 jurisdictionProfileVersions, jurisdictionProfileVerificationDecisions,
 jurisdictions, organizations,
} from "@/db/schema";
import { and, eq, desc, inArray, isNotNull } from "drizzle-orm";

type ProfileAuthority = "manage" | "verify";
async function assertJurisdictionProfileAuthority(
 context: Awaited<ReturnType<typeof getCommandContext>>,
 authority: ProfileAuthority,
) {
 const manager=authority==="manage";
 const role=manager?"can_network_steward":"can_jurisdiction_reviewer";
 const capability=manager?"jurisdiction.profile.manage":"jurisdiction.profile.verify";
 if(context.role!==role||!context.actorPersonId||context.grantSiteId!==null)
  throw new AuthorizationError(capability);
 assertCapability(context,capability);
 const organizationIds=context.scope.organizationIds??[];
 if(organizationIds.length===0)throw new AuthorizationError("CAN network organization scope");
 const [organization]=await db.select({id:organizations.id}).from(organizations).where(and(
  eq(organizations.type,"can_network"),inArray(organizations.id,organizationIds),
 )).limit(1);
 if(!organization)throw new AuthorizationError("CAN network organization scope");
}

/**
 * Registrar-facing editorial read. Review records are never exposed through
 * public launch projections; only a published version can inform launch.
 */
export const listJurisdictionProfileReviews = createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 const canManage=context.role==="can_network_steward";
 const canVerify=context.role==="can_jurisdiction_reviewer";
 if(!canManage&&!canVerify)throw new AuthorizationError("jurisdiction profile review access");
 await assertJurisdictionProfileAuthority(context,canManage?"manage":"verify");
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
  lastEditedByPersonId:jurisdictionProfileVersions.lastEditedByPersonId,
  verifiedByPersonId:jurisdictionProfileVersions.verifiedByPersonId,
  verificationEvidence:jurisdictionProfileVersions.verificationEvidence,
  reviewedAt:jurisdictionProfileVersions.reviewedAt,
  nextReviewAt:jurisdictionProfileVersions.nextReviewAt,
  publishedAt:jurisdictionProfileVersions.publishedAt,
 }).from(jurisdictionProfileVersions)
 .innerJoin(jurisdictions,eq(jurisdictions.id,jurisdictionProfileVersions.jurisdictionId))
 .where(inArray(jurisdictionProfileVersions.status,["draft","in_review","published"]))
 .orderBy(jurisdictions.name,desc(jurisdictionProfileVersions.createdAt));
 return rows.map(row=>({...row,canEdit:canManage,canVerify,canPublish:canManage,
  profile:JSON.stringify(row.profile),evidence:JSON.stringify(row.evidence),
  verificationEvidence:JSON.stringify(row.verificationEvidence)}));
});

export const listPublishedJurisdictionGuidance = createServerFn({method:"GET"}).handler(async()=>{
 const context=await getCommandContext(getRequest());
 assertCapability(context,"program.read");
 const rows=await db.select({
  profileVersionId:jurisdictionProfileVersions.id,
  jurisdictionId:jurisdictionProfileVersions.jurisdictionId,
  summary:jurisdictionProfileVersions.summary,
  profile:jurisdictionProfileVersions.profile,
  evidence:jurisdictionProfileVersions.evidence,
  verificationEvidence:jurisdictionProfileVersions.verificationEvidence,
  verifiedByPersonId:jurisdictionProfileVersions.verifiedByPersonId,
  verificationStatus:jurisdictionProfileVersions.verificationStatus,
  publishedAt:jurisdictionProfileVersions.publishedAt,
 }).from(jurisdictionProfileVersions).where(and(
  eq(jurisdictionProfileVersions.status,"published"),
  eq(jurisdictionProfileVersions.verificationStatus,"verified"),
  isNotNull(jurisdictionProfileVersions.verifiedByPersonId),
 )).orderBy(desc(jurisdictionProfileVersions.publishedAt));
 const decisions=rows.length?await db.select({
  profileVersionId:jurisdictionProfileVerificationDecisions.profileVersionId,
  reviewerPersonId:jurisdictionProfileVerificationDecisions.reviewerPersonId,
  evidence:jurisdictionProfileVerificationDecisions.evidence,
 }).from(jurisdictionProfileVerificationDecisions)
  .where(inArray(jurisdictionProfileVerificationDecisions.profileVersionId,rows.map(row=>row.profileVersionId)))
  .orderBy(desc(jurisdictionProfileVerificationDecisions.createdAt)):[];
 const latestDecisionByProfile=new Map<string,(typeof decisions)[number]>();
 for(const decision of decisions)
  if(!latestDecisionByProfile.has(decision.profileVersionId))
   latestDecisionByProfile.set(decision.profileVersionId,decision);
 const byJurisdiction:Record<string,{summary:string;publishedAt:string|null}>={};
 for(const row of rows){
  const decision=latestDecisionByProfile.get(row.profileVersionId);
  const decisionEvidence=decision?.evidence as {note?:unknown}|undefined;
  const currentEvidence=row.verificationEvidence as {note?:unknown};
  if(!row.verifiedByPersonId||decision?.reviewerPersonId!==row.verifiedByPersonId||
     !isJurisdictionProfileVerificationEvidenceCurrent(decision?.evidence,row.evidence)||
     !isJurisdictionProfileVerificationEvidenceCurrent(row.verificationEvidence,row.evidence)||
     decisionEvidence?.note!==currentEvidence.note)continue;
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
  await assertJurisdictionProfileAuthority(context,"manage");
  jurisdictionProfileSchema.parse({...data.profile,summary:data.summary,evidence:data.evidence});
  const [existing]=await db.select({status:jurisdictionProfileVersions.status})
   .from(jurisdictionProfileVersions).where(eq(jurisdictionProfileVersions.id,data.id)).limit(1);
  if(!existing || !["draft","in_review"].includes(existing.status))throw Error("Only unpublished reviews can be edited");
  const saved=await db.transaction(async tx=>{
   const [updated]=await tx.update(jurisdictionProfileVersions).set({
   title:data.title,summary:data.summary,profile:data.profile,evidence:data.evidence,
   lastEditedByPersonId:context.actorPersonId,
   verificationStatus:"unverified",verifiedByPersonId:null,verificationEvidence:{},reviewedAt:null,
   updatedAt:new Date(),
  }).where(and(eq(jurisdictionProfileVersions.id,data.id),inArray(jurisdictionProfileVersions.status,["draft","in_review"])))
   .returning({id:jurisdictionProfileVersions.id});
   if(!updated)throw Error("Review was changed concurrently; reload and try again");
   await writeAudit(tx,context,{action:"jurisdiction.profile.review.updated",entityType:"jurisdiction_profile_version",entityId:updated.id,after:{title:data.title,summary:data.summary,evidenceCount:data.evidence.length}});
   return updated;
  });
  return {id:saved.id};
 });

const verificationInput=z.object({
 id:z.string().uuid(),
 note:z.string().trim().min(25).max(2000),
});
export const verifyJurisdictionProfileReview=createServerFn({method:"POST"})
 .validator((value:unknown)=>verificationInput.parse(value))
 .handler(async({data})=>{
  const context=await getCommandContext(getRequest());
  await assertJurisdictionProfileAuthority(context,"verify");
  const reviewerPersonId=context.actorPersonId;
  if(!reviewerPersonId)throw new AuthorizationError("authenticated jurisdiction reviewer identity");
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(jurisdictionProfileVersions)
    .where(eq(jurisdictionProfileVersions.id,data.id)).for("update");
   if(!record||record.status!=="in_review")throw new Error("Only profiles in review can be verified");
   if(record.lastEditedByPersonId===reviewerPersonId)
    throw new AuthorizationError("a reviewer distinct from the profile editor");
   const sources=record.evidence;
   jurisdictionProfileSchema.parse({...record.profile,summary:record.summary,evidence:sources});
   if(!Array.isArray(sources)||sources.length===0)
    throw new Error("Add authoritative sources before independent verification");
   const sourceSnapshot=sources.map(source=>{
    if(!source||typeof source!=="object"||typeof source.title!=="string"||
       typeof source.url!=="string"||!source.url.startsWith("https://")||
       typeof source.authority!=="string"||!source.checkedAt)
     throw new Error("Each source needs an HTTPS URL, authority, and checked date");
    return {title:source.title,url:source.url,authority:source.authority,checkedAt:source.checkedAt};
   });
   const now=new Date();
   const [verified]=await tx.update(jurisdictionProfileVersions).set({
    verificationStatus:"verified",verifiedByPersonId:reviewerPersonId,
    verificationEvidence:{note:data.note,sources:sourceSnapshot},reviewedAt:now,updatedAt:now,
   }).where(and(eq(jurisdictionProfileVersions.id,data.id),eq(jurisdictionProfileVersions.status,"in_review")))
    .returning({id:jurisdictionProfileVersions.id});
   if(!verified)throw new Error("Profile was modified; reload and retry");
   await tx.insert(jurisdictionProfileVerificationDecisions).values({
    profileVersionId:verified.id,reviewerPersonId,
    evidence:{note:data.note,sources:sourceSnapshot},
   });
   await writeAudit(tx,context,{action:"jurisdiction.profile.verified",entityType:"jurisdiction_profile_version",entityId:verified.id,
    after:{revision:record.revision,sourceCount:sourceSnapshot.length}});
   return {id:verified.id};
  });
 });

/** Publish a reviewed profile only when official sources have been recorded. */
export const publishJurisdictionProfile=createServerFn({method:"POST"})
 .validator((value:unknown)=>z.object({id:z.string().uuid()}).parse(value))
 .handler(async({data})=>{
  const context=await getCommandContext(getRequest());
  await assertJurisdictionProfileAuthority(context,"manage");
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(jurisdictionProfileVersions)
    .where(eq(jurisdictionProfileVersions.id,data.id)).for("update");
   if(!record || record.status!=="in_review")throw Error("Profile must be in review before publication");
   const [decision]=await tx.select().from(jurisdictionProfileVerificationDecisions)
    .where(eq(jurisdictionProfileVerificationDecisions.profileVersionId,record.id))
    .orderBy(desc(jurisdictionProfileVerificationDecisions.createdAt)).limit(1);
   const decisionEvidence=decision?.evidence as {note?:unknown}|undefined;
   const currentEvidence=record.verificationEvidence as {note?:unknown};
   if(record.verificationStatus!=="verified"||!record.verifiedByPersonId||
      record.verifiedByPersonId===context.actorPersonId||
      record.verifiedByPersonId===record.lastEditedByPersonId||
      !decision||decision.reviewerPersonId!==record.verifiedByPersonId||
      decisionEvidence?.note!==currentEvidence.note||
      !isJurisdictionProfileVerificationEvidenceCurrent(decision.evidence,record.evidence)||
      !isJurisdictionProfileVerificationEvidenceCurrent(record.verificationEvidence,record.evidence))
    throw new AuthorizationError("independent reviewer attestation for the current profile evidence");
   const sources=record.evidence;
   jurisdictionProfileSchema.parse({...record.profile,summary:record.summary,evidence:sources});
   if(!Array.isArray(sources)||sources.length===0)throw Error("Add authoritative sources before publishing");
   for(const source of sources){
    if(!source || typeof source!=="object" || typeof source.url!=="string" || !source.url.startsWith("https://") || !source.authority || !source.checkedAt)
     throw Error("Each source needs an HTTPS URL, authority, and checked date");
   }
   const [published]=await tx.update(jurisdictionProfileVersions).set({
    status:"published",
    publishedAt:new Date(),updatedAt:new Date(),
   }).where(and(eq(jurisdictionProfileVersions.id,data.id),eq(jurisdictionProfileVersions.status,"in_review")))
    .returning({id:jurisdictionProfileVersions.id});
   if(!published)throw Error("Profile was modified; reload and retry");
   await writeAudit(tx,context,{action:"jurisdiction.profile.published",entityType:"jurisdiction_profile_version",entityId:published.id,
    after:{revision:record.revision,sourceCount:sources.length,verifiedByPersonId:record.verifiedByPersonId}});
   return {id:published.id};
  });
 });
