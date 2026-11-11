import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  organizations, sites, sitePublications, sitePublicationReleases, siteBlueprints,
  siteBlueprintRevisions, siteBlueprintReviewRequests, siteBlueprintApprovedVersions,
  siteBlueprintApprovalDecisions,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { publicProspectusSchema, assertPublicProspectusClaims } from "@/domain/school-blueprint-approval";
import type { PublicBlueprintProspectus } from "@/domain/school-blueprint-approval";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { changeSitePublicationWithinTransaction, requireSitePublisher } from "@/modules/sites/site-publication.server";
import { writeAudit, emitEvent } from "@/platform/mutation";

const uuid=z.string().uuid();
const prepare=z.object({
 siteId:uuid,expectedBlueprintRevision:z.number().int().positive(),
 heading:z.string().trim().min(5).max(120),introduction:z.string().trim().min(20).max(1000),
 includedSubjects:z.array(z.object({kind:z.enum(["program","item"]),id:uuid}).strict()).min(1).max(75),
}).strict();
const reviewInput=z.object({releaseId:uuid}).strict();
const publishInput=z.object({
 siteId:uuid,releaseId:uuid,expectedSiteRevision:z.string().datetime(),
 reason:z.string().trim().min(10).max(500),
}).strict();

function requireSitePlanEditor(actor:AccessContext,siteId:string,orgId:string){
 assertCapability(actor,"program.launch.start");
 if(!hasRegistrarAuthority(actor.role)||!actor.actorPersonId||
  !actor.scope.siteIds?.includes(siteId)||!actor.scope.organizationIds?.includes(orgId))
  throw new AuthorizationError("Site school planner");
}
async function requireCanProspectusReviewer(actor:AccessContext){
 assertCapability(actor,"network.agreements.verify");
 if(actor.role!=="can_network_steward"||actor.sessionAccountId||
  actor.grantSiteId!==null||actor.scope.organizationIds?.length!==1||!actor.actorPersonId)
  throw new AuthorizationError("CAN prospectus reviewer");
 const [institution]=await db.select({type:organizations.type}).from(organizations)
  .where(eq(organizations.id,actor.scope.organizationIds[0]!)).limit(1);
 if(institution?.type!=="can_network")throw new AuthorizationError("CAN institution");
}

type Candidate={id:string;kind:"program"|"item";title:string;summary:string;fingerprint:string};
const fingerprint=(v:unknown)=>JSON.stringify(v);
function extract(snapshot:Record<string,unknown>):Candidate[]{
 const rows:Candidate[]=[];
 for(const p of Array.isArray(snapshot.programs)?snapshot.programs:[]){
  if(!p||typeof p!=="object"||typeof p.id!=="string"||typeof p.name!=="string")continue;
  rows.push({id:p.id,kind:"program",title:p.name,summary:"",
    fingerprint:fingerprint({name:p.name,kind:p.kind,gradeRange:p.gradeRange,deliveryModel:p.deliveryModel})});
 }
 for(const i of Array.isArray(snapshot.items)?snapshot.items:[]){
  if(!i||typeof i!=="object"||typeof i.id!=="string"||typeof i.title!=="string")continue;
  rows.push({id:i.id,kind:"item",title:i.title,summary:typeof i.summary==="string"?i.summary:"",
    fingerprint:fingerprint({title:i.title,kind:i.kind,summary:i.summary,configuration:i.configuration})});
 }
 return rows;
}

/** A hosted school's vision can be reviewed before its Programs have been authorized. */
export const prepareSchoolPlanningProspectus=createServerFn({method:"POST"})
.validator((raw:unknown)=>prepare.parse(raw))
.handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
  const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId}).from(sites)
    .where(eq(sites.id,data.siteId)).for("update").limit(1);
  if(!site)throw new AuthorizationError("existing Site");
  requireSitePlanEditor(actor,site.id,site.organizationId);
  const [head]=await tx.select().from(siteBlueprints).where(eq(siteBlueprints.siteId,site.id)).limit(1);
  if(!head||head.currentRevision!==data.expectedBlueprintRevision)
    throw new DomainError("CONFLICT","School Blueprint changed. Refresh before preparing the prospectus.");
  const [saved]=await tx.select({snapshot:siteBlueprintRevisions.snapshot}).from(siteBlueprintRevisions)
   .where(and(eq(siteBlueprintRevisions.siteId,site.id),eq(siteBlueprintRevisions.revision,data.expectedBlueprintRevision))).limit(1);
  if(!saved)throw new DomainError("CONFLICT","Save your School Blueprint before preparing a prospectus.");
  const candidates=extract(saved.snapshot);
  const lookup=new Map(candidates.map(row=>[row.kind+":"+row.id,row]));
  if(data.includedSubjects.some(x=>!lookup.has(x.kind+":"+x.id))||
     new Set(data.includedSubjects.map(x=>x.kind+":"+x.id)).size!==data.includedSubjects.length)
    throw new DomainError("VALIDATION_FAILED","Select distinct offerings from this School Blueprint only.");
  const [lastApproved]=await tx.select().from(siteBlueprintApprovedVersions)
   .where(eq(siteBlueprintApprovedVersions.siteId,site.id))
   .orderBy(desc(siteBlueprintApprovedVersions.version)).limit(1);
  const [pending]=await tx.select({id:siteBlueprintReviewRequests.id}).from(siteBlueprintReviewRequests)
   .where(and(eq(siteBlueprintReviewRequests.siteId,site.id),eq(siteBlueprintReviewRequests.status,"submitted")))
   .orderBy(desc(siteBlueprintReviewRequests.sourceRevision)).limit(1);
  const decisions=lastApproved?await tx.select().from(siteBlueprintApprovalDecisions)
   .where(eq(siteBlueprintApprovalDecisions.approvalVersionId,lastApproved.id)):[];
  const decisionsByKey=new Map(decisions.map(x=>[x.subjectKind+":"+x.subjectId,x]));
  const approvedSource=extract((lastApproved?.approvedSnapshot??{}) as Record<string,unknown>);
  const originals=new Map(approvedSource.map(x=>[x.kind+":"+x.id,x]));
  const items:PublicBlueprintProspectus["items"]=[];
  for(const subject of data.includedSubjects){
   const key=subject.kind+":"+subject.id,source=lookup.get(key)!;
   const decision=decisionsByKey.get(key);
   const stillSame=originals.get(key)?.fingerprint===source.fingerprint;
   let state:PublicBlueprintProspectus["items"][number]["state"]="future";
   if(decision && stillSame && decision.decision==="approved" && decision.publicVisibility==="confirmed")
     state="confirmed";
   else if((decision?.publicVisibility==="under_review"&&stillSame)||pending)
     state="under_review";
   else if(decision?.publicVisibility==="hidden" && stillSame)
     continue;
   const summary=decision?.publicSummary && stillSame?decision.publicSummary:source.summary;
   items.push({sourceId:source.id,sourceKind:source.kind,title:source.title,
     summary:summary.slice(0,600),state,
     canApprovalVersion:state==="confirmed"?lastApproved!.version:null});
  }
  const prospectus=publicProspectusSchema.parse({
   version:1,heading:data.heading,introduction:data.introduction,
   notice:"Our school is being developed. Proposed experiences are not available for application or enrollment unless separately confirmed.",
   sourceBlueprintRevision:data.expectedBlueprintRevision,
   canApprovalVersion:lastApproved?.version??null,items,
  });
  assertPublicProspectusClaims(prospectus);
  const [last]=await tx.select({revision:sitePublicationReleases.revision}).from(sitePublicationReleases)
   .where(eq(sitePublicationReleases.siteId,site.id))
   .orderBy(desc(sitePublicationReleases.revision)).limit(1);
  const revision=(last?.revision??0)+1;
  const [created]=await tx.insert(sitePublicationReleases).values({
    siteId:site.id,revision,status:"draft",mode:"planning_prospectus",
    contentSnapshot:JSON.parse(JSON.stringify(prospectus)) as Record<string,unknown>,
    sourceRevisionMap:{blueprintRevision:data.expectedBlueprintRevision,canApprovalVersion:lastApproved?.version??null},
  }).returning({id:sitePublicationReleases.id});
  if(!created)throw new Error("Planning prospectus could not be prepared");
  await writeAudit(tx,actor,{action:"school.prospectus.prepare",entityType:"site_publication_release",
   entityId:created.id,scope:{organizationId:site.organizationId,siteId:site.id},
   after:{revision,mode:"planning_prospectus",blueprintRevision:data.expectedBlueprintRevision,itemCount:items.length}});
  await emitEvent(tx,{eventType:"SchoolPlanningProspectusPrepared",aggregateType:"SitePublicationRelease",
   aggregateId:created.id,actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,
   payload:{revision,blueprintRevision:data.expectedBlueprintRevision}});
  return {releaseId:created.id,revision,prospectus};
 });
});

/** CAN reviews the *public wording* separately from its item-level operating decision. */
export const reviewSchoolPlanningProspectus=createServerFn({method:"POST"})
.validator((raw:unknown)=>reviewInput.parse(raw))
.handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 await requireCanProspectusReviewer(actor);
 return db.transaction(async tx=>{
  const [release]=await tx.select().from(sitePublicationReleases)
   .where(eq(sitePublicationReleases.id,data.releaseId)).for("update").limit(1);
  if(!release||release.mode!=="planning_prospectus"||release.status!=="draft")
   throw new DomainError("CONFLICT","Prospectus is not awaiting public review.");
  const content=publicProspectusSchema.parse(release.contentSnapshot);
  assertPublicProspectusClaims(content);
  // Review may approve the vision, not create school operating or enrolment authority.
  const [newRecord]=await tx.update(sitePublicationReleases).set({
   status:"approved",reviewedByPersonId:actor.actorPersonId!,reviewedAt:new Date(),
  }).where(eq(sitePublicationReleases.id,release.id)).returning({id:sitePublicationReleases.id});
  if(!newRecord)throw new Error("Prospectus review did not persist");
  await writeAudit(tx,actor,{action:"school.prospectus.review.approve",entityType:"site_publication_release",
    entityId:release.id,scope:{siteId:release.siteId},after:{revision:release.revision}});
  await emitEvent(tx,{eventType:"SchoolPlanningProspectusReviewed",aggregateType:"SitePublicationRelease",
    aggregateId:release.id,actorPersonId:actor.actorPersonId,siteId:release.siteId,payload:{revision:release.revision}});
  return {releaseId:release.id,status:"approved" as const};
 });
});

/** Existing publication permission, URL and current-review gates remain mandatory. */
export const publishSchoolPlanningProspectus=createServerFn({method:"POST"})
.validator((raw:unknown)=>publishInput.parse(raw))
.handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");
 const actor=await getCommandContext(getRequest());
 return db.transaction(async tx=>{
  const site=await requireSitePublisher(actor,data.siteId,tx);
  const [publication]=await tx.select().from(sitePublications)
    .where(eq(sitePublications.siteId,site.id)).for("update").limit(1);
  if(!publication)throw new DomainError("CONFLICT","Reserve the school's public website address first.");
  const [release]=await tx.select().from(sitePublicationReleases)
    .where(and(eq(sitePublicationReleases.id,data.releaseId),eq(sitePublicationReleases.siteId,site.id))).for("update").limit(1);
  if(!release||release.mode!=="planning_prospectus"||release.status!=="approved"||!release.reviewedByPersonId)
    throw new DomainError("CONFLICT","CAN must review this planning prospectus before publication.");
  if(release.reviewedByPersonId===actor.actorPersonId)
    throw new AuthorizationError("independent public prospectus publisher");
  const [latestApproval]=await tx.select({version:siteBlueprintApprovedVersions.version})
    .from(siteBlueprintApprovedVersions).where(eq(siteBlueprintApprovedVersions.siteId,site.id))
    .orderBy(desc(siteBlueprintApprovedVersions.version)).limit(1);
  const map=release.sourceRevisionMap as {canApprovalVersion?:number|null};
  if((map.canApprovalVersion??null)!==(latestApproval?.version??null))
    throw new DomainError("CONFLICT","Approved operating scope changed. Prepare a revised prospectus.");
  await changeSitePublicationWithinTransaction(actor,{
    siteId:site.id,action:"publish",expectedRevision:data.expectedSiteRevision,
    reason:data.reason,contentReviewed:true,
  },tx);
  await tx.update(sitePublicationReleases).set({
    status:"published",publishedByPersonId:actor.actorPersonId!,publishedAt:new Date(),
  }).where(eq(sitePublicationReleases.id,release.id));
  await writeAudit(tx,actor,{action:"school.prospectus.publish",entityType:"site_publication_release",
    entityId:release.id,scope:{siteId:site.id,organizationId:site.organizationId},
    after:{releaseRevision:release.revision,mode:"planning_prospectus"}});
  await emitEvent(tx,{eventType:"SchoolPlanningProspectusPublished",aggregateType:"SitePublicationRelease",
    aggregateId:release.id,actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,
    payload:{revision:release.revision}});
  return {releaseId:release.id,status:"published" as const};
 });
});
