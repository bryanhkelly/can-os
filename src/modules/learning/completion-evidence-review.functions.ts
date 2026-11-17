import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, domainEvents, evidenceDocumentVersions, evidenceDocuments,
  learningCompletionEvidenceBindings, learningCompletionEvidenceReviewRequests,
} from "@/db/canonical-v301";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "@/modules/identity/canonical-command-context.server";
import { assertCurrentCanonicalStaffForMutation } from "@/modules/identity/canonical-transaction-authorization.server";
import { assertCurrentCredentialIssuer } from "@/modules/identity/canonical-sensitive-authorization.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor=Awaited<ReturnType<typeof getCanonicalCommandContext>>;
const uuid=z.string().uuid();
const common={
  evidenceVersionId:uuid,
  reason:z.string().trim().min(10).max(1000),
};
const requestSchema=z.discriminatedUnion("purpose",[
  z.object({
    purpose:z.literal("completion_correction"),
    registrationId:uuid,
    expectedDecisionId:uuid,
    approvedOutcome:z.enum(["not_yet_completed","voided"]),
    ...common,
  }).strict(),
  z.object({
    purpose:z.literal("award_revocation"),
    issuanceId:uuid,
    ...common,
  }).strict(),
  z.object({
    purpose:z.literal("class_completion_decision"),
    classEnrollmentId:uuid,
    expectedClassOutcomeId:uuid.nullable(),
    approvedOutcome:z.enum(["completed","not_yet_completed","voided"]),
    ...common,
  }).strict(),
]);
type ReviewIntent=z.infer<typeof requestSchema>;
const decisionSchema=z.object({
  requestId:uuid,decision:z.enum(["approve","reject"]),
}).strict();
type ResolvedTarget={
  participantPersonId:string;providerOrganizationId:string;
  deliverySiteId:string;
};

function assertOperatorScope(actor:Actor,target:ResolvedTarget){
  if(!actor.actorPersonId ||
     !["site_admin","registrar"].includes(actor.role??"") ||
     actor.scope.organizationIds?.length!==1 ||
     actor.scope.siteIds?.length!==1 ||
     actor.scope.organizationIds[0]!==target.providerOrganizationId ||
     actor.scope.siteIds[0]!==target.deliverySiteId ||
     actor.actorPersonId===target.participantPersonId)
    throw new AuthorizationError("exact independent provider Person, Organization and Site");
}
function assertPurposeCapability(actor:Actor,purpose:ReviewIntent["purpose"]){
  if(purpose==="class_completion_decision") assertCapability(actor,"class.manage");
  if(purpose==="completion_correction")assertCapability(actor,"noncredit.completion.decide");
}

/** Resolve original source identity and current decision exclusively through
 * canonical joins. The browser never provides Person/Organization/Site IDs.
 */
async function resolveSource(tx:Tx,intent:ReviewIntent):Promise<ResolvedTarget> {
  let query;
  if(intent.purpose==="completion_correction"){
    query=await tx.execute(sql`
      SELECT r.participant_person_id AS "participantPersonId",
             training.provider_organization_id AS "providerOrganizationId",
             attribution.delivery_site_id AS "deliverySiteId"
      FROM education_v30.noncredit_registrations r
      JOIN education_v30.noncredit_training_versions training
        ON training.id=r.training_version_id
      JOIN education_v30.participation_attributions attribution
        ON attribution.noncredit_registration_id=r.id
      JOIN education_v30.noncredit_completion_decisions prior
        ON prior.registration_id=r.id AND prior.id=${intent.expectedDecisionId}::uuid
      WHERE r.id=${intent.registrationId}::uuid
        AND r.completion_policy_id=prior.policy_id
        AND NOT EXISTS(
          SELECT 1 FROM education_v30.noncredit_completion_decisions newer
          WHERE newer.supersedes_id=prior.id)
      LIMIT 2
    `);
  } else if(intent.purpose==="class_completion_decision"){
    query=await tx.execute(sql`
      SELECT e.learner_person_id AS "participantPersonId",
             cls.operating_organization_id AS "providerOrganizationId",
             attribution.delivery_site_id AS "deliverySiteId"
      FROM education_v30.class_enrollments e
      JOIN education_v30.classes cls ON cls.id=e.class_id
      JOIN education_v30.participation_attributions attribution
        ON attribution.class_enrollment_id=e.id
          AND attribution.delivery_site_id=cls.site_id
      JOIN education_v30.class_enrollment_completion_pins pin
        ON pin.class_enrollment_id=e.id
      WHERE e.id=${intent.classEnrollmentId}::uuid
        AND ((
          ${intent.expectedClassOutcomeId}::uuid IS NULL
          AND e.status='active'
          AND NOT EXISTS(
            SELECT 1 FROM education_v30.class_outcomes existing
            WHERE existing.class_enrollment_id=e.id
              AND existing.outcome_kind='completion'
              AND existing.source_kind='ws3_governed'
          )
        ) OR (
          ${intent.expectedClassOutcomeId}::uuid IS NOT NULL
          AND EXISTS(
            SELECT 1 FROM education_v30.class_outcomes prior
            WHERE prior.id=${intent.expectedClassOutcomeId}::uuid
              AND prior.class_enrollment_id=e.id
              AND prior.outcome_kind='completion'
              AND prior.source_kind='ws3_governed'
              AND NOT EXISTS(
                SELECT 1 FROM education_v30.class_outcomes newer
                WHERE newer.supersedes_outcome_id=prior.id
              )
          )
        ))
      LIMIT 2
    `);
  } else {
    query=await tx.execute(sql`
      SELECT decision.recipient_person_id AS "participantPersonId",
             issuance.issuer_organization_id AS "providerOrganizationId",
             attribution.delivery_site_id AS "deliverySiteId"
      FROM education_v30.learning_award_issuances issuance
      JOIN education_v30.learner_achievement_decisions decision
        ON decision.id=issuance.achievement_decision_id
      JOIN education_v30.noncredit_completion_decisions completion
        ON completion.id=decision.noncredit_completion_decision_id
      JOIN education_v30.noncredit_registrations registration
        ON registration.id=completion.registration_id
      JOIN education_v30.participation_attributions attribution
        ON attribution.noncredit_registration_id=registration.id
      WHERE issuance.id=${intent.issuanceId}::uuid
        AND NOT EXISTS(
          SELECT 1 FROM education_v30.learning_award_issuance_events revocation
          WHERE revocation.issuance_id=issuance.id
            AND revocation.event_kind='revoked')
      LIMIT 2
    `);
  }
  if(query.rows.length!==1)throw new AuthorizationError("one current canonical source");
  const row=query.rows[0] as Record<string,unknown>;
  if(typeof row.participantPersonId!=="string" ||
     typeof row.providerOrganizationId!=="string" ||
     typeof row.deliverySiteId!=="string")
    throw new AuthorizationError("complete canonical source Person, Org and Site");
  return {participantPersonId:row.participantPersonId,
    providerOrganizationId:row.providerOrganizationId,
    deliverySiteId:row.deliverySiteId};
}

async function assertVerifiedEvidence(tx:Tx, versionId:string,source:ResolvedTarget,
  submitterPersonId:string){
  const [evidence]=await tx.select({
    owningOrganizationId:evidenceDocuments.owningOrganizationId,
    verifiedAt:evidenceDocumentVersions.verifiedAt,
    verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
    validFrom:evidenceDocumentVersions.validFrom,
    validThrough:evidenceDocumentVersions.validThrough,
  }).from(evidenceDocumentVersions)
    .innerJoin(evidenceDocuments,
      eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
    .where(eq(evidenceDocumentVersions.id,versionId)).limit(1);
  const now=new Date(),today=now.toISOString().slice(0,10);
  if(!evidence || evidence.owningOrganizationId!==source.providerOrganizationId ||
     !evidence.verifiedAt || evidence.verifiedAt>now ||
     !evidence.verifiedByPersonId ||
     evidence.verifiedByPersonId===source.participantPersonId ||
     evidence.verifiedByPersonId===submitterPersonId ||
     (evidence.validFrom && evidence.validFrom>today) ||
     (evidence.validThrough && evidence.validThrough<today))
    throw new AuthorizationError("independent current source evidence");
}

function intentFromRequest(row:typeof learningCompletionEvidenceReviewRequests.$inferSelect):ReviewIntent{
  const common={evidenceVersionId:row.evidenceVersionId,reason:row.reviewReason};
  switch(row.purpose) {
    case "completion_correction":
      if(!row.noncreditRegistrationId || !row.expectedDecisionId ||
         !row.approvedCorrectionOutcome)throw new AuthorizationError("complete noncredit target");
      return {purpose:row.purpose,registrationId:row.noncreditRegistrationId,
        expectedDecisionId:row.expectedDecisionId,
        approvedOutcome:row.approvedCorrectionOutcome,...common};
    case "award_revocation":
      if(!row.awardIssuanceId)throw new AuthorizationError("complete issuance target");
      return {purpose:row.purpose,issuanceId:row.awardIssuanceId,...common};
    case "class_completion_decision":
      if(!row.classEnrollmentId || !row.approvedClassOutcome)
        throw new AuthorizationError("complete Class outcome target");
      return {purpose:row.purpose,classEnrollmentId:row.classEnrollmentId,
        expectedClassOutcomeId:row.expectedClassOutcomeId,
        approvedOutcome:row.approvedClassOutcome,...common};
  }
}

function rowFromIntent(intent:ReviewIntent){
  return {
    purpose:intent.purpose,
    noncreditRegistrationId:intent.purpose==="completion_correction"?intent.registrationId:null,
    expectedDecisionId:intent.purpose==="completion_correction"?intent.expectedDecisionId:null,
    approvedCorrectionOutcome:intent.purpose==="completion_correction"?intent.approvedOutcome:null,
    awardIssuanceId:intent.purpose==="award_revocation"?intent.issuanceId:null,
    classEnrollmentId:intent.purpose==="class_completion_decision"?intent.classEnrollmentId:null,
    expectedClassOutcomeId:intent.purpose==="class_completion_decision"?
      intent.expectedClassOutcomeId:null,
    approvedClassOutcome:intent.purpose==="class_completion_decision"?intent.approvedOutcome:null,
  };
}

/** Stage an exact immutable source and independently verified evidence.
 * Submission grants nothing; only a second current authorized staff Person
 * may review the request and create a canonical source binding.
 */
export const requestCompletionEvidenceReview=createServerFn({method:"POST"})
  .validator((raw:unknown)=>requestSchema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private, no-store");
    if(process.env.CAN_WS3_EVIDENCE_REVIEW_ENABLED!=="true")
      throw new AuthorizationError("evidence review flow not enabled");
    const request=getRequest(),actor=await getCanonicalCommandContext(request);
    assertPurposeCapability(actor,data.purpose);
    return db.transaction(async tx=>{
      const source=await resolveSource(tx,data);
      assertOperatorScope(actor,source);
      if(data.purpose==="award_revocation")
        await assertCurrentCredentialIssuer(tx,request,actor);
      else
        await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      await assertVerifiedEvidence(tx,data.evidenceVersionId,source,actor.actorPersonId!);
      const [created]=await tx.insert(learningCompletionEvidenceReviewRequests).values({
        ...rowFromIntent(data),evidenceVersionId:data.evidenceVersionId,
        participantPersonId:source.participantPersonId,
        providerOrganizationId:source.providerOrganizationId,
        deliverySiteId:source.deliverySiteId,
        submittedByPersonId:actor.actorPersonId!,reviewReason:data.reason,
        status:"pending",
      }).returning({id:learningCompletionEvidenceReviewRequests.id});
      if(!created)throw new Error("Review request not recorded");
      const payload={requestId:created.id,purpose:data.purpose,
        evidenceVersionId:data.evidenceVersionId,
        sourceScope:{
          organizationId:source.providerOrganizationId,siteId:source.deliverySiteId,
        }};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId!,
        owningOrganizationId:source.providerOrganizationId,
        eventCode:"learning.completion_evidence.review_requested",
        entityKind:"completion_evidence_review_request",entityId:created.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId!,
        eventType:"CompletionEvidenceReviewRequested",
        aggregateType:"completion_evidence_review_request",aggregateId:created.id,payload,
      });
      return {requestId:created.id,status:"pending" as const};
    });
  });

/** Review is original-Site scoped; a network reviewer without a current
 * independently verified exact-Site grant cannot approve a learner.
 */
const pendingQueueInput=z.object({
  page:z.number().int().min(0).max(100).default(0),
}).strict();
export const getPendingCompletionEvidenceReviews=createServerFn({method:"GET"})
  .validator((raw:unknown)=>pendingQueueInput.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_WS3_EVIDENCE_REVIEW_ENABLED!=="true")
      throw new AuthorizationError("evidence review flow not enabled");
    const request=getRequest(),actor=await getCanonicalCommandContext(request);
    if(!actor.actorPersonId || !["site_admin","registrar"].includes(actor.role??"") ||
       actor.scope.organizationIds?.length!==1 || actor.scope.siteIds?.length!==1)
      throw new AuthorizationError("one current provider and Site");
    return db.transaction(async tx=>{
      await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      const allowedPurposes:ReviewIntent["purpose"][]=[];
      if(actor.capabilities.has("class.manage"))
        allowedPurposes.push("class_completion_decision");
      if(actor.capabilities.has("noncredit.completion.decide"))
        allowedPurposes.push("completion_correction");
      // Credential issuer approval is separately reviewed and expiring.
      // Ordinary Site Admin/Registrar role must not expose issuance requests.
      try {
        await assertCurrentCredentialIssuer(tx,request,actor);
        allowedPurposes.push("award_revocation");
      } catch { /* no independently approved issuer authority */ }
      if(!allowedPurposes.length)return {pending:[],hasMore:false,page:data.page};
      const rows=await tx.select().from(learningCompletionEvidenceReviewRequests)
        .where(and(
          inArray(learningCompletionEvidenceReviewRequests.purpose,allowedPurposes),
          eq(learningCompletionEvidenceReviewRequests.providerOrganizationId,
            actor.scope.organizationIds![0]!),
          eq(learningCompletionEvidenceReviewRequests.deliverySiteId,
            actor.scope.siteIds![0]!),
          eq(learningCompletionEvidenceReviewRequests.status,"pending"),
        )).orderBy(asc(learningCompletionEvidenceReviewRequests.createdAt),
          asc(learningCompletionEvidenceReviewRequests.id))
        .limit(51).offset(data.page*50);
      return {page:data.page,hasMore:rows.length>50,
        pending:rows.slice(0,50).filter(row=>row.submittedByPersonId!==actor.actorPersonId)
        .map(row=>({
          requestId:row.id,purpose:row.purpose,
          sourceId:row.noncreditRegistrationId??row.awardIssuanceId??
            row.classEnrollmentId,
          expectedPriorDecisionId:row.expectedDecisionId??row.expectedClassOutcomeId,
          proposedOutcome:row.approvedCorrectionOutcome??row.approvedClassOutcome,
          reviewReason:row.reviewReason,
          evidenceVersionId:row.evidenceVersionId,
          createdAt:row.createdAt.toISOString(),
        }))};
    });
  });

/** Separate independently authorized staff reviewer creates the final source
 * binding. A rejected request cannot issue an award or mutate completion.
 */
export const decideCompletionEvidenceReview=createServerFn({method:"POST"})
  .validator((raw:unknown)=>decisionSchema.parse(raw))
  .handler(async({data})=>{
    setResponseHeader("Cache-Control","private,no-store");
    if(process.env.CAN_WS3_EVIDENCE_REVIEW_ENABLED!=="true")
      throw new AuthorizationError("evidence review flow not enabled");
    const request=getRequest(),actor=await getCanonicalCommandContext(request);
    return db.transaction(async tx=>{
      const [record]=await tx.select().from(learningCompletionEvidenceReviewRequests)
        .where(eq(learningCompletionEvidenceReviewRequests.id,data.requestId))
        .for("update").limit(1);
      if(!record||record.status!=="pending")
        throw new AuthorizationError("one pending independently reviewed source request");
      const intent=intentFromRequest(record);
      assertPurposeCapability(actor,intent.purpose);
      const source=await resolveSource(tx,intent);
      assertOperatorScope(actor,source);
      if(actor.actorPersonId===record.submittedByPersonId ||
         source.participantPersonId!==record.participantPersonId ||
         source.providerOrganizationId!==record.providerOrganizationId ||
         source.deliverySiteId!==record.deliverySiteId)
        throw new AuthorizationError("independent reviewer and unchanged source");
      if(intent.purpose==="award_revocation")
        await assertCurrentCredentialIssuer(tx,request,actor);
      else
        await assertCurrentCanonicalStaffForMutation(tx,request,actor);
      await assertVerifiedEvidence(tx,record.evidenceVersionId,source,
        record.submittedByPersonId);
      const now=new Date();
      if(data.decision==="approve"){
        await tx.insert(learningCompletionEvidenceBindings).values({
          ...rowFromIntent(intent),
          evidenceVersionId:record.evidenceVersionId,
          participantPersonId:source.participantPersonId,
          providerOrganizationId:source.providerOrganizationId,
          deliverySiteId:source.deliverySiteId,
          submittedByPersonId:record.submittedByPersonId,
          approvedByPersonId:actor.actorPersonId!,
          approvedAt:now,reviewReason:record.reviewReason,
        });
      }
      const [updated]=await tx.update(learningCompletionEvidenceReviewRequests).set({
        status:data.decision==="approve"?"approved":"rejected",
        reviewedByPersonId:actor.actorPersonId!,reviewedAt:now,
      }).where(and(
        eq(learningCompletionEvidenceReviewRequests.id,record.id),
        eq(learningCompletionEvidenceReviewRequests.status,"pending"),
      )).returning({id:learningCompletionEvidenceReviewRequests.id});
      if(!updated)throw new AuthorizationError("review was already decided");
      const payload={requestId:record.id,purpose:record.purpose,
        decision:data.decision,siteId:source.deliverySiteId,
        evidenceVersionId:record.evidenceVersionId};
      await tx.insert(auditEvents).values({
        actorPersonId:actor.actorPersonId!,
        owningOrganizationId:source.providerOrganizationId,
        eventCode:"learning.completion_evidence.review_decided",
        entityKind:"completion_evidence_review_request",entityId:record.id,payload,
      });
      await tx.insert(domainEvents).values({
        actorPersonId:actor.actorPersonId!,
        eventType:"CompletionEvidenceReviewDecided",
        aggregateType:"completion_evidence_review_request",aggregateId:record.id,payload,
      });
      return {requestId:record.id,status:data.decision==="approve"?
        "approved" as const:"rejected" as const};
    });
  });
