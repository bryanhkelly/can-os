import {and,eq} from "drizzle-orm";
import {db} from "@/db/client";
import {actions,documents,programs,sites} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {assertCapability,AuthorizationError} from "@/domain/command-context";
import {hasRegistrarAuthority} from "@/domain/school-roles";
import {writeAudit,emitEvent} from "@/platform/mutation";
import {EventTypes} from "@/domain/event-types";
import {readSchoolJurisdictionReview} from "./school-jurisdiction-review.server";
import {jurisdictionRequirementActionType} from "./school-jurisdiction-requirements.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockRequirement(tx:Tx,actionId:string){
  const [candidate]=await tx.select({programId:actions.programId,siteId:actions.siteId})
    .from(actions).where(eq(actions.id,actionId)).limit(1);
  if(!candidate?.siteId||!candidate.programId)
    throw new AuthorizationError("existing school-specific requirement");
  // Same locking order as Site address editing and school legal attestation.
  const [site]=await tx.select({id:sites.id}).from(sites)
    .where(eq(sites.id,candidate.siteId)).for("update").limit(1);
  const [program]=await tx.select({id:programs.id,organizationId:programs.organizationId,
    siteId:programs.siteId}).from(programs)
    .where(eq(programs.id,candidate.programId)).for("update").limit(1);
  const [action]=await tx.select().from(actions).where(eq(actions.id,actionId))
    .for("update").limit(1);
  if(!site||!program||!action||action.type!==jurisdictionRequirementActionType ||
    action.subjectType!=="program"||action.subjectId!==program.id||
    action.programId!==program.id||action.siteId!==site.id ||
    action.organizationId!==program.organizationId||program.siteId!==site.id)
    throw new AuthorizationError("canonical Program legal Action scope");
  return {site,program,action};
}

function requireSubmittedDocument(document:typeof documents.$inferSelect | undefined,
  programId:string,siteId:string,organizationId:string,now:Date){
  if(!document || document.subjectType!=="program"||document.subjectId!==programId ||
    document.metadata.siteId!==siteId||document.metadata.organizationId!==organizationId||
    document.storageProvider!=="cloudflare_r2" ||
    document.metadata.storageVerified!==true ||
    (document.expiresAt && document.expiresAt<=now))
    throw new AuthorizationError("current scoped verified-storage Program evidence document");
}

/** Church submission records evidence; it cannot approve the requirement. */
export async function submitSchoolJurisdictionRequirementEvidence(
  actor:AccessContext,input:{actionId:string;documentId:string;statement:string},
){
  if(!actor.actorPersonId || !hasRegistrarAuthority(actor.role))
    throw new AuthorizationError("verified Site registrar");
  assertCapability(actor,"program.launch.start");
  if(input.statement.trim().length<10||input.statement.length>4000)
    throw new Error("Provide a specific legal requirement evidence statement");
  return db.transaction(async tx=>{
    const {site,program,action}=await lockRequirement(tx,input.actionId);
    if(!actor.scope.organizationIds?.includes(program.organizationId)||
      !actor.scope.siteIds?.includes(site.id)||
      !actor.scope.programIds?.includes(program.id))
      throw new AuthorizationError("school legal document submission scope");
    const review=await readSchoolJurisdictionReview(actor,program.id,tx);
    if(review.reviewRequired || !review.policyVersionId ||
      action.metadata.profileVersionId!==review.policyVersionId ||
      action.metadata.scopeFingerprint!==review.scopeFingerprint)
      throw new Error("Renew the school-specific CAN legal review before submitting evidence");
    const [document]=await tx.select().from(documents)
      .where(eq(documents.id,input.documentId)).limit(1);
    const now=new Date();
    requireSubmittedDocument(document,program.id,site.id,program.organizationId,now);
    if(!document || document.uploadedByPersonId!==actor.actorPersonId)
      throw new AuthorizationError("evidence uploaded by the school registrar");
    const prior=[...action.evidence].reverse().find(entry=>
      entry.kind==="school_jurisdiction_requirement_submission");
    if(action.status==="waiting"&&
      prior?.documentId===document.id && prior?.statement===input.statement &&
      prior?.scopeFingerprint===review.scopeFingerprint)
      return {actionId:action.id,submitted:true,duplicate:true};
    const evidence={
      kind:"school_jurisdiction_requirement_submission",
      documentId:document.id,statement:input.statement,
      submittedAt:now.toISOString(),submittedByPersonId:actor.actorPersonId,
      scopeFingerprint:review.scopeFingerprint,profileVersionId:review.policyVersionId,
    };
    await tx.update(actions).set({status:"waiting",resolvedAt:null,resolutionNote:null,
      metadata:{...action.metadata,reviewState:"awaiting_independent_evidence_review",
        submittedByPersonId:actor.actorPersonId,evidenceDocumentId:document.id},
      evidence:[...action.evidence,evidence],updatedAt:now,
    }).where(eq(actions.id,action.id));
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.requirement.evidence_submitted",
      entityType:"action",entityId:action.id,
      scope:{organizationId:program.organizationId,siteId:site.id,programId:program.id},
      after:{evidenceDocumentId:document.id,reviewState:"awaiting_independent_evidence_review"},
    });
    return {actionId:action.id,submitted:true,duplicate:false};
  });
}

/** Only the independent CAN jurisdiction reviewer may accept documented
 * compliance with a currently applicable requirement. It is NOT a declaration
 * of government provider enrollment, public disclosure, or funding eligibility. */
export async function decideSchoolJurisdictionRequirementEvidence(
  actor:AccessContext,input:{actionId:string;decision:"verify"|"request_changes";note:string},
){
  if(!actor.actorPersonId||actor.role!=="can_jurisdiction_reviewer" ||
    actor.grantSiteId!==null||actor.sessionAccountId)
    throw new AuthorizationError("independent CAN jurisdiction reviewer");
  assertCapability(actor,"jurisdiction.profile.verify");
  if(input.note.trim().length<25||input.note.length>2000)
    throw new Error("Independent evidence decision requires a substantive rationale");
  return db.transaction(async tx=>{
    const {site,program,action}=await lockRequirement(tx,input.actionId);
    const review=await readSchoolJurisdictionReview(actor,program.id,tx);
    if(review.reviewRequired||!review.policyVersionId ||
      action.metadata.profileVersionId!==review.policyVersionId ||
      action.metadata.scopeFingerprint!==review.scopeFingerprint)
      throw new Error("CAN must renew the school-specific legal review first");
    const submittedBy=action.metadata.submittedByPersonId;
    if(typeof submittedBy!=="string"||submittedBy===actor.actorPersonId)
      throw new AuthorizationError("independent reviewer distinct from evidence submitter");
    const prior=[...action.evidence].reverse().find(entry=>
      entry.kind==="school_jurisdiction_requirement_submission");
    if(!prior || typeof prior.documentId!=="string" ||
      prior.scopeFingerprint!==review.scopeFingerprint ||
      prior.profileVersionId!==review.policyVersionId)
      throw new Error("No current school legal requirement submission exists");
    const [document]=await tx.select().from(documents)
      .where(eq(documents.id,prior.documentId)).limit(1);
    const now=new Date();
    requireSubmittedDocument(document,program.id,site.id,program.organizationId,now);
    const scope={organizationId:program.organizationId,siteId:site.id,programId:program.id};
    if(input.decision==="verify"){
      if(!document || !document.verifiedAt||document.verifiedAt>now ||
        !document.verifiedByPersonId||
        document.uploadedByPersonId===document.verifiedByPersonId)
        throw new AuthorizationError("independently verified current evidence document");
      if(action.status==="resolved" &&
        action.metadata.reviewState==="independently_verified_documentation")
        return {actionId:action.id,verified:true,duplicate:true};
      if(action.status!=="waiting")
        throw new Error("Requirement must have a pending submitted document");
      await tx.update(actions).set({
        status:"resolved",resolvedAt:now,
        resolutionNote:"CAN reviewed independently verified documentary evidence",
        metadata:{...action.metadata,reviewState:"independently_verified_documentation",
          reviewedByPersonId:actor.actorPersonId,reviewedAt:now.toISOString(),
          reviewNote:input.note,evidenceDocumentId:document.id,
          governmentApproval:"not_asserted",fundingEligibility:"not_asserted"},
        evidence:[...action.evidence,{kind:"school_jurisdiction_requirement_review",
          decision:"documentation_verified",documentId:document.id,
          reviewerPersonId:actor.actorPersonId,reviewedAt:now.toISOString(),note:input.note}],
        updatedAt:now,
      }).where(eq(actions.id,action.id));
      await emitEvent(tx,{
        eventType:EventTypes.ActionResolved,aggregateType:"action",
        aggregateId:action.id,actorPersonId:actor.actorPersonId,
        ...scope,payload:{source:jurisdictionRequirementActionType,
          requirementId:action.metadata.requirementId},
      });
      await writeAudit(tx,actor,{
        action:"program.jurisdiction.requirement.document_verified",
        entityType:"action",entityId:action.id,scope,
        before:{status:action.status},after:{status:"resolved",
          documentId:document.id,reviewerPersonId:actor.actorPersonId},
      });
      return {actionId:action.id,verified:true,duplicate:false};
    }
    await tx.update(actions).set({
      status:"open",resolvedAt:null,resolutionNote:null,
      metadata:{...action.metadata,reviewState:"evidence_rejected",
        reviewedByPersonId:actor.actorPersonId,reviewedAt:now.toISOString()},
      evidence:[...action.evidence,{kind:"school_jurisdiction_requirement_review",
        decision:"changes_requested",reviewerPersonId:actor.actorPersonId,
        reviewedAt:now.toISOString(),note:input.note,documentId:prior.documentId}],
      updatedAt:now,
    }).where(eq(actions.id,action.id));
    await writeAudit(tx,actor,{
      action:"program.jurisdiction.requirement.evidence_rejected",
      entityType:"action",entityId:action.id,scope,
      before:{status:action.status},after:{status:"open",reviewedAt:now.toISOString()},
    });
    return {actionId:action.id,verified:false,duplicate:false};
  });
}
