import { and,eq } from "drizzle-orm";
import { db } from "@/db/client";
import { actions,jurisdictionProfileVersions,programs,sites } from "@/db/schema";
import type { AccessContext } from "@/domain/access-context";
import { assertCapability,AuthorizationError } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import { EventTypes } from "@/domain/event-types";
import { emitEvent,writeAudit } from "@/platform/mutation";
import { readSchoolJurisdictionReview } from "./school-jurisdiction-review.server";
import { jurisdictionProfileSchema,isOfficialJurisdictionSource } from "@/domain/jurisdiction-profile";
import { reconcileSchoolJurisdictionRequirementActions } from "./school-jurisdiction-requirements.server";

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
    const [target]=await tx.select({siteId:programs.siteId}).from(programs)
      .where(eq(programs.id,programId)).limit(1);
    if(!target?.siteId)throw new AuthorizationError("canonical school Site");
    const [lockedSite]=await tx.select({id:sites.id}).from(sites)
      .where(eq(sites.id,target.siteId)).for("update").limit(1);
    if(!lockedSite)throw new AuthorizationError("canonical school Site");
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
    const [existing]=await tx.select({id:actions.id,status:actions.status,metadata:actions.metadata}).from(actions)
      .where(and(
        eq(actions.type,schoolJurisdictionReviewActionType),
        eq(actions.subjectType,"program"),
        eq(actions.subjectId,program.id),
        eq(actions.organizationId,program.organizationId),
        eq(actions.siteId,program.siteId),
        eq(actions.programId,program.id),
      )).limit(1);
    if(existing){
      const revisionChanged=existing.metadata.profileRevision!==review.revision;
      const locationChanged=existing.metadata.locationReviewReason!==review.locationReviewReason;
      const scopeChanged=existing.metadata.scopeFingerprint!==review.scopeFingerprint;
      if(revisionChanged || locationChanged || scopeChanged || existing.status==="resolved" || existing.status==="cancelled"){
        await tx.update(actions).set({
          status:"open",resolvedAt:null,resolutionNote:null,
          metadata:{...existing.metadata,
            profileRevision:review.revision,reviewState:"legal_review_requested",
            requesterPersonId:actor.actorPersonId,
            requestReceivedAt:new Date().toISOString(),
            locationReviewReason:review.locationReviewReason ?? null,
            scopeFingerprint:review.scopeFingerprint,
            pendingRequirementIds:review.decisions.filter(item=>
              item.status==="legal_review_required").map(item=>item.id)},
          updatedAt:new Date(),
        }).where(eq(actions.id,existing.id));
        const scope={organizationId:program.organizationId,siteId:program.siteId,programId:program.id};
        await writeAudit(tx,actor,{
          action:"program.jurisdiction.legal_review.reopened",
          entityType:"action",entityId:existing.id,scope,
          before:{status:existing.status,profileRevision:existing.metadata.profileRevision,
            scopeFingerprint:existing.metadata.scopeFingerprint},
          after:{status:"open",profileRevision:review.revision,
            scopeFingerprint:review.scopeFingerprint},
        });
      }
      return {programId,created:false,needed:true,actionId:existing.id};
    }
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
        locationReviewReason:review.locationReviewReason ?? null,
        scopeFingerprint:review.scopeFingerprint,
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

/**
 * CAN reviewer attestation for one persisted school scope.
 * Explicitly separate from policy publication, public legal disclosure,
 * operating approval, safety evidence, admissions and state funding approval.
 * The Site row lock serializes with Agent S's physical-address editor.
 */
export async function decideSchoolJurisdictionLegalReview(
  actor:AccessContext,input:{
    programId:string;expectedScopeFingerprint:string;expectedSiteRevision:string;
    decision:"verify"|"request_changes";note:string;sourceUrls:string[];
  },
) {
  if(!actor.actorPersonId || actor.role!=="can_jurisdiction_reviewer" ||
    actor.grantSiteId!==null || actor.sessionAccountId)
    throw new AuthorizationError("independent CAN jurisdiction reviewer");
  assertCapability(actor,"jurisdiction.profile.verify");
  if(input.note.trim().length<25 || input.note.length>2000)
    throw new Error("A substantive current-review rationale is required");
  return db.transaction(async tx=>{
    const [target]=await tx.select({siteId:programs.siteId}).from(programs)
      .where(eq(programs.id,input.programId)).limit(1);
    if(!target?.siteId)throw new AuthorizationError("existing Program Site");
    const [site]=await tx.select({id:sites.id,updatedAt:sites.updatedAt})
      .from(sites).where(eq(sites.id,target.siteId)).for("update").limit(1);
    if(!site)throw new AuthorizationError("canonical Site record");
    const [program]=await tx.select({id:programs.id,organizationId:programs.organizationId})
      .from(programs).where(eq(programs.id,input.programId)).for("update").limit(1);
    if(!program)throw new AuthorizationError("canonical Program record");
    const review=await readSchoolJurisdictionReview(actor,input.programId,tx);
    if(review.scopeFingerprint!==input.expectedScopeFingerprint ||
      review.siteAddressRevision!==input.expectedSiteRevision)
      throw new Error("Site or Program configuration changed; refresh current review");
    if(review.locationReviewReason && input.decision==="verify")
      throw new Error("Physical Site address requires correction before independent verification");
    const [legal]=await tx.select().from(actions).where(and(
      eq(actions.type,schoolJurisdictionReviewActionType),
      eq(actions.subjectType,"program"),eq(actions.subjectId,input.programId),
      eq(actions.siteId,target.siteId),eq(actions.programId,input.programId),
      eq(actions.organizationId,program.organizationId),
    )).for("update").limit(1);
    if(!legal || typeof legal.metadata.requesterPersonId!=="string")
      throw new Error("Church registrar must request the legal review first");
    if(legal.metadata.requesterPersonId===actor.actorPersonId)
      throw new AuthorizationError("reviewer must be independent of requester");
    // A past submission cannot authorize a new Site/Program scope. The church
    // must explicitly request the current revision before CAN re-verifies it.
    if(input.decision==="verify" && legal.status==="resolved" &&
      (legal.metadata.scopeFingerprint!==review.scopeFingerprint ||
       legal.metadata.profileRevision!==review.revision))
      throw new Error("Church registrar must reopen legal review for the amended school configuration");
    if(input.decision==="verify" && !review.reviewRequired &&
      legal.status==="resolved" && legal.metadata.reviewState==="independently_verified")
      return {programId:input.programId,verified:true,actionId:legal.id,
        reconciliation:{created:0,reopened:0,superseded:0}};
    const [location]=await tx.select().from(actions).where(and(
      eq(actions.type,"site_location_change_review"),
      eq(actions.subjectType,"program"),eq(actions.subjectId,input.programId),
      eq(actions.siteId,target.siteId),eq(actions.programId,input.programId),
    )).for("update").limit(1);
    if(location?.metadata.requestedByPersonId===actor.actorPersonId)
      throw new AuthorizationError("reviewer must be independent of Site editor");
    const now=new Date();
    const reviewedAt=now.toISOString();
    if(input.decision==="verify"){
      if(!review.policyReady || !review.policyVersionId)
        throw new Error("Current policy and school-specific scope still require review");
      const [policy]=await tx.select({id:jurisdictionProfileVersions.id,
        evidence:jurisdictionProfileVersions.evidence,
        profile:jurisdictionProfileVersions.profile,
        summary:jurisdictionProfileVersions.summary})
        .from(jurisdictionProfileVersions)
        .where(and(eq(jurisdictionProfileVersions.id,review.policyVersionId),
          eq(jurisdictionProfileVersions.status,"published"))).limit(1);
      if(!policy)throw new Error("Verified jurisdiction policy is no longer published");
      const parsed=jurisdictionProfileSchema.safeParse({
        ...policy.profile,summary:policy.summary,evidence:policy.evidence,
      });
      if(!parsed.success)throw new Error("Published policy no longer has valid source-backed requirements");
      const official=new Set(parsed.data.evidence.flatMap(source=>
        isOfficialJurisdictionSource(source)
          ? [source.url] : []));
      const cited=[...new Set(input.sourceUrls)];
      if(!cited.length || cited.some(url=>!official.has(url)))
        throw new Error("Select source URLs from the currently verified policy");
      const metadata={
        reviewState:"independently_verified",
        reviewedByPersonId:actor.actorPersonId,reviewedAt,
        reviewNote:input.note,reviewedSourceUrls:cited,
        scopeFingerprint:review.scopeFingerprint,profileVersionId:policy.id,
        profileRevision:review.revision,
      };
      const evidence={
        kind:"school_jurisdiction_independent_review",decision:"verified",
        scopeFingerprint:review.scopeFingerprint,profileVersionId:policy.id,
        siteRevision:review.siteAddressRevision,reviewedByPersonId:actor.actorPersonId,
        reviewedAt,note:input.note,sourceUrls:cited,
      };
      await tx.update(actions).set({
        status:"resolved",resolvedAt:now,
        resolutionNote:"CAN jurisdiction reviewer attested current school scope",
        metadata:{...legal.metadata,...metadata},
        evidence:[...legal.evidence,evidence],updatedAt:now,
      }).where(eq(actions.id,legal.id));
      if(location){
        await tx.update(actions).set({
          status:"resolved",resolvedAt:now,
          resolutionNote:"Site change independently reviewed; opening approval still required",
          metadata:{...location.metadata,...metadata,
            requesterPersonId:location.metadata.requestedByPersonId},
          evidence:[...location.evidence,evidence],updatedAt:now,
        }).where(eq(actions.id,location.id));
      }
      await writeAudit(tx,actor,{
        action:"program.jurisdiction.independently_verified",
        entityType:"action",entityId:legal.id,
        scope:{organizationId:legal.organizationId,
          siteId:target.siteId,programId:input.programId},
        before:{status:legal.status,scopeFingerprint:legal.metadata.scopeFingerprint},
        after:{status:"resolved",scopeFingerprint:review.scopeFingerprint,
          policyVersionId:policy.id,siteRevision:review.siteAddressRevision,
          sourceCount:cited.length},
      });
      const reconciliation=await reconcileSchoolJurisdictionRequirementActions(tx,actor,{
        programId:input.programId,siteId:target.siteId,
        organizationId:program.organizationId,profileVersionId:policy.id,
        scopeFingerprint:review.scopeFingerprint,profile:parsed.data,
        decisions:review.decisions,
      });
      return {programId:input.programId,verified:true,actionId:legal.id,reconciliation};
    }
    await tx.update(actions).set({
      status:"open",resolvedAt:null,resolutionNote:null,
      metadata:{...legal.metadata,reviewState:"changes_requested",
        reviewedByPersonId:actor.actorPersonId,reviewedAt},
      evidence:[...legal.evidence,{
        kind:"school_jurisdiction_independent_review",decision:"changes_requested",
        note:input.note,reviewedAt,reviewedByPersonId:actor.actorPersonId,
      }],updatedAt:now,
    }).where(eq(actions.id,legal.id));
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.changes_requested",
      entityType:"action",entityId:legal.id,
      scope:{organizationId:legal.organizationId,
        siteId:target.siteId,programId:input.programId},
      after:{status:"open",reviewedAt},
    });
    return {programId:input.programId,verified:false,actionId:legal.id};
  });
}
