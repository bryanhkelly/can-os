import { and,eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions,programs } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { readSchoolJurisdictionReview } from "./school-jurisdiction-review.server";

export const schoolJurisdictionReviewActionType="school_jurisdiction_legal_review";

/**
 * Request for CAN legal review, NOT clearance. The existing program row lock
 * serializes this idempotent action creation across parallel launch sessions.
 */
export async function ensureSchoolJurisdictionReviewAction(
  actor:AccessContext, programId:string,
) {
  if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
    throw new AuthorizationError("verified registrar");
  assertCapability(actor,"program.launch.start");
  return db.transaction(async tx=>{
    const [program]=await tx.select({
      id:programs.id,siteId:programs.siteId,
      organizationId:programs.organizationId,
    }).from(programs).where(eq(programs.id,programId))
      .for("update").limit(1);
    if(!program || !program.siteId ||
      !actor.scope.organizationIds?.includes(program.organizationId) ||
      !actor.scope.siteIds?.includes(program.siteId) ||
      !actor.scope.programIds?.includes(program.id))
      throw new AuthorizationError("school jurisdiction review scope");
    const review=await readSchoolJurisdictionReview(actor,programId,tx);
    if(!review.reviewRequired)
      return {programId,created:false,needed:false,actionId:null};
    const [existing]=await tx.select({id:actions.id}).from(actions)
      .where(and(
        eq(actions.type,schoolJurisdictionReviewActionType),
        eq(actions.subjectType,"program"),
        eq(actions.subjectId,program.id),
        eq(actions.organizationId,program.organizationId),
        eq(actions.siteId,program.siteId),
        eq(actions.programId,program.id),
      )).limit(1);
    if(existing)
      return {programId,created:false,needed:true,actionId:existing.id};
    const scope={organizationId:program.organizationId,
      siteId:program.siteId,programId:program.id};
    const [created]=await tx.insert(actions).values({
      type:schoolJurisdictionReviewActionType,
      title:"CAN legal review required for this school",
      description:"Validate current jurisdiction applicability, operating model, official evidence, and required disclosures. Completing this request does not authorize opening.",
      subjectType:"program",subjectId:program.id,
      status:"open",priority:"high",...scope,
      metadata:{version:1,reviewState:"legal_review_requested",
        profileRevision:review.revision,requesterPersonId:actor.actorPersonId,
        pendingRequirementIds:review.decisions.filter(item=>
          item.status==="legal_review_required").map(item=>item.id)},
    }).returning({id:actions.id});
    if(!created)throw new Error("Could not record legal review request");
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.legal_review.requested",
      entityType:"action",entityId:created.id,scope,
      after:{profileRevision:review.revision,reviewState:"legal_review_requested"},
    });
    await emitEvent(tx,{
      eventType:EventTypes.ActionCreated,aggregateType:"action",
      aggregateId:created.id,actorPersonId:actor.actorPersonId,
      ...scope,payload:{source:schoolJurisdictionReviewActionType,
        programId:program.id,profileRevision:review.revision},
    });
    return {programId,created:true,needed:true,actionId:created.id};
  });
}
