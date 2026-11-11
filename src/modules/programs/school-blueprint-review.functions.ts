import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  organizations, sites, siteBlueprints, siteBlueprintRevisions, siteBlueprintReviewRequests,
  siteBlueprintApprovedVersions, siteBlueprintApprovalDecisions,
} from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { blueprintReviewSchema, blueprintRevisionDiff } from "@/domain/school-blueprint-approval";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { writeAudit, emitEvent } from "@/platform/mutation";

const siteInput=z.object({siteId:z.string().uuid(),expectedRevision:z.number().int().min(1)}).strict();
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The Site may propose; only a CAN institution reviewer may approve. */
function requireLocalBlueprintEditor(actor:AccessContext,siteId:string,organizationId:string) {
  assertCapability(actor,"program.launch.start");
  if(!hasRegistrarAuthority(actor.role)||!actor.actorPersonId||
    !actor.scope.siteIds?.includes(siteId)||!actor.scope.organizationIds?.includes(organizationId))
    throw new AuthorizationError("authorized school Blueprint editor");
}
async function requireCanBlueprintReviewer(actor:AccessContext,tx:Pick<typeof db,"select">) {
  assertCapability(actor,"network.agreements.verify");
  if(actor.role!=="can_network_steward"||actor.sessionAccountId||actor.grantSiteId!==null||
     (actor.scope.organizationIds?.length??0)!==1||!actor.actorPersonId)
    throw new AuthorizationError("independent CAN Blueprint reviewer");
  const orgId=actor.scope.organizationIds![0]!;
  const [org]=await tx.select({type:organizations.type}).from(organizations)
    .where(eq(organizations.id,orgId)).limit(1);
  if(org?.type!=="can_network")throw new AuthorizationError("CAN institutional reviewer");
  return orgId;
}
async function loadReviewSite(tx:Pick<typeof db,"select">,siteId:string){
  const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId,name:sites.name})
    .from(sites).where(eq(sites.id,siteId)).limit(1);
  if(!site)throw new AuthorizationError("existing school Site");
  return site;
}
const frozen=(value:unknown):Record<string,unknown>=>JSON.parse(JSON.stringify(value)) as Record<string,unknown>;

/** Capture exactly what was submitted. Later school edits never alter this version. */
export const submitSchoolBlueprintForReview=createServerFn({method:"POST"})
.validator((raw:unknown)=>siteInput.parse(raw))
.handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  return db.transaction(async tx=>{
    const site=await loadReviewSite(tx,data.siteId);
    requireLocalBlueprintEditor(actor,site.id,site.organizationId);
    await tx.select({id:sites.id}).from(sites).where(eq(sites.id,site.id)).for("update").limit(1);
    const [head]=await tx.select().from(siteBlueprints).where(eq(siteBlueprints.siteId,site.id)).limit(1);
    if(!head||head.currentRevision!==data.expectedRevision)
      throw new DomainError("CONFLICT","School Blueprint changed. Reload before submitting.");
    const [revision]=await tx.select().from(siteBlueprintRevisions)
      .where(and(eq(siteBlueprintRevisions.siteId,site.id),eq(siteBlueprintRevisions.revision,data.expectedRevision))).limit(1);
    if(!revision)throw new DomainError("CONFLICT","Save the School Blueprint before submitting.");
    const proposed=revision.snapshot as {programs?:unknown;items?:unknown};
    if(!Array.isArray(proposed.programs)||!Array.isArray(proposed.items))
      throw new DomainError("CONFLICT","This older draft needs to be saved again to capture a complete review snapshot.");
    const [existing]=await tx.select({id:siteBlueprintReviewRequests.id})
      .from(siteBlueprintReviewRequests).where(and(eq(siteBlueprintReviewRequests.siteId,site.id),
        eq(siteBlueprintReviewRequests.sourceRevision,data.expectedRevision))).limit(1);
    if(existing)return {requestId:existing.id,created:false};
    const [created]=await tx.insert(siteBlueprintReviewRequests).values({
      siteId:site.id,sourceRevision:data.expectedRevision,proposalSnapshot:frozen(revision.snapshot),
      submittedByPersonId:actor.actorPersonId!,
    }).returning({id:siteBlueprintReviewRequests.id});
    if(!created)throw new Error("School Blueprint submission did not persist");
    await writeAudit(tx,actor,{action:"school.blueprint.review.request",entityType:"site_blueprint_review",
      entityId:created.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{sourceRevision:data.expectedRevision}});
    await emitEvent(tx,{eventType:"SchoolBlueprintReviewRequested",aggregateType:"SiteBlueprint",
      aggregateId:site.id,actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,
      payload:{requestId:created.id,sourceRevision:data.expectedRevision}});
    return {requestId:created.id,created:true};
  });
});

/** Reviewer desk never exposes unapproved proposals to unauthenticated parents. */
export const getSchoolBlueprintReviewDesk=createServerFn({method:"GET"})
.handler(async()=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  await requireCanBlueprintReviewer(actor,db);
  const pending=await db.select({
    id:siteBlueprintReviewRequests.id,siteId:siteBlueprintReviewRequests.siteId,
    sourceRevision:siteBlueprintReviewRequests.sourceRevision,
    proposalSnapshot:siteBlueprintReviewRequests.proposalSnapshot,
    siteName:sites.name,submittedAt:siteBlueprintReviewRequests.submittedAt,
  }).from(siteBlueprintReviewRequests)
    .innerJoin(sites,eq(sites.id,siteBlueprintReviewRequests.siteId))
    .where(eq(siteBlueprintReviewRequests.status,"submitted"))
    .orderBy(desc(siteBlueprintReviewRequests.submittedAt)).limit(100);
  if(!pending.length)return [];
  const versions=await db.select({siteId:siteBlueprintApprovedVersions.siteId,version:siteBlueprintApprovedVersions.version})
    .from(siteBlueprintApprovedVersions)
    .where(inArray(siteBlueprintApprovedVersions.siteId,[...new Set(pending.map(x=>x.siteId))]));
  const latest=new Map<string,number>();
  for(const v of versions)latest.set(v.siteId,Math.max(latest.get(v.siteId)??0,v.version));
  function jsonSafe(value:unknown):string { return JSON.stringify(value); }
  return pending.map(row=>({
    ...row,
    proposalSnapshot: {
      programs: Array.isArray(row.proposalSnapshot.programs)
        ? row.proposalSnapshot.programs.map((p:Record<string,unknown>)=>({
            id:String(p.id??""),name:String(p.name??""),kind:String(p.kind??""),
            gradeRange:jsonSafe(p.gradeRange??{}),deliveryModel:jsonSafe(p.deliveryModel??{}),
          })) : [],
      items: Array.isArray(row.proposalSnapshot.items)
        ? row.proposalSnapshot.items.map((i:Record<string,unknown>)=>({
            id:String(i.id??""),title:String(i.title??""),kind:String(i.kind??""),
            summary:String(i.summary??""),configuration:jsonSafe(i.configuration??{}),
          })) : [],
    },
    expectedApprovedVersion:latest.get(row.siteId)??0,
  }));
});

/** CAN approval can be partial; item decisions are complete and independently auditable. */
export const decideSchoolBlueprintReview=createServerFn({method:"POST"})
.validator((raw:unknown)=>blueprintReviewSchema.parse(raw))
.handler(async({data})=>{
  setResponseHeader("Cache-Control","private, no-store");
  const actor=await getCommandContext(getRequest());
  return db.transaction(async tx=>{
    const institutionId=await requireCanBlueprintReviewer(actor,tx);
    const site=await loadReviewSite(tx,data.siteId);
    await tx.select({id:sites.id}).from(sites).where(eq(sites.id,site.id)).for("update").limit(1);
    const [request]=await tx.select().from(siteBlueprintReviewRequests)
      .where(and(eq(siteBlueprintReviewRequests.id,data.reviewRequestId),
        eq(siteBlueprintReviewRequests.siteId,site.id))).for("update").limit(1);
    if(!request||request.status!=="submitted")
      throw new DomainError("CONFLICT","The Blueprint review is no longer pending.");
    if(request.submittedByPersonId===actor.actorPersonId)
      throw new AuthorizationError("independent Blueprint reviewer");
    const [prior]=await tx.select({version:siteBlueprintApprovedVersions.version,snapshot:siteBlueprintApprovedVersions.approvedSnapshot})
      .from(siteBlueprintApprovedVersions).where(eq(siteBlueprintApprovedVersions.siteId,site.id))
      .orderBy(desc(siteBlueprintApprovedVersions.version)).limit(1);
    if((prior?.version??0)!==data.expectedApprovedVersion)
      throw new DomainError("CONFLICT","The approved baseline changed. Review the latest version.");
    const snapshot=request.proposalSnapshot as {programs?:{id:string}[];items?:{id:string}[]};
    if(!Array.isArray(snapshot.programs)||!Array.isArray(snapshot.items))
      throw new DomainError("CONFLICT","Submitted snapshot is incomplete.");
    const subjects=new Set([
      ...snapshot.programs.map(x=>"program:"+x.id),...snapshot.items.map(x=>"item:"+x.id),
    ]);
    const decisions=new Set(data.decisions.map(x=>x.subjectKind+":"+x.subjectId));
    if(subjects.size!==decisions.size||data.decisions.length!==decisions.size||
      [...subjects].some(key=>!decisions.has(key)))
      throw new DomainError("VALIDATION_FAILED","Record a review decision for every submitted offering.");
    const version=(prior?.version??0)+1;
    const [approved]=await tx.insert(siteBlueprintApprovedVersions).values({
      siteId:site.id,version,reviewRequestId:request.id,sourceRevision:request.sourceRevision,
      approvedSnapshot:frozen(request.proposalSnapshot),schoolScopeStatement:data.schoolScopeStatement,
      reviewedByPersonId:actor.actorPersonId!,
    }).returning({id:siteBlueprintApprovedVersions.id});
    if(!approved)throw new Error("Blueprint approval version did not persist");
    if(data.decisions.length)await tx.insert(siteBlueprintApprovalDecisions).values(data.decisions.map(d=>({
      approvalVersionId:approved.id,subjectKind:d.subjectKind,subjectId:d.subjectId,
      decision:d.decision,conditions:d.conditions,evidence:d.evidence,
      publicVisibility:d.publicVisibility,publicSummary:d.publicSummary,
      requiredForOpening:d.requiredForOpening,
      effectiveFrom:d.effectiveFrom,effectiveThrough:d.effectiveThrough,
    })));
    await tx.update(siteBlueprintReviewRequests).set({status:"reviewed"})
      .where(eq(siteBlueprintReviewRequests.id,request.id));
    const diff=blueprintRevisionDiff((prior?.snapshot??{}) as typeof snapshot,snapshot);
    await writeAudit(tx,actor,{action:"school.blueprint.review.decide",entityType:"site_blueprint_approval",
      entityId:approved.id,scope:{siteId:site.id,organizationId:site.organizationId},
      after:{version,sourceRevision:request.sourceRevision,decisionCount:data.decisions.length,diff}});
    await emitEvent(tx,{eventType:"SchoolBlueprintScopeReviewed",aggregateType:"SiteBlueprint",
      aggregateId:site.id,actorPersonId:actor.actorPersonId,siteId:site.id,organizationId:site.organizationId,
      payload:{approvalVersionId:approved.id,version,diff,canInstitutionId:institutionId,
        requiresProspectusReview:true}});
    return {approvalVersionId:approved.id,version,diff};
  });
});
