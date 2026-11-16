import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  evidenceDocuments, evidenceDocumentVersions,
  learningCompletionEvidenceBindings,
} from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CompletionEvidenceTarget =
  | {
      purpose:"completion_correction";
      registrationId:string;
      expectedDecisionId:string;
      approvedCorrectionOutcome:"not_yet_completed"|"voided";
    }
  | {purpose:"award_revocation"; issuanceId:string};

/**
 * Generic evidence verification alone cannot authorize corrections/revocation.
 * An independent pre-approved source binding must match the exact participant,
 * provider, delivery Site and (for corrections) superseded decision, outcome,
 * and reason. The binding is immutable and separately protected by SQL RLS.
 * This command does NOT create/approve a binding.
 */
export async function assertSourceBoundCompletionEvidence(
  tx:Tx,
  target:CompletionEvidenceTarget,
  input:{
    evidenceVersionId:string;participantPersonId:string;organizationId:string;
    deliverySiteId:string;actorPersonId:string;reason:string;
  },
):Promise<void>{
  if (!input.actorPersonId || input.actorPersonId===input.participantPersonId)
    throw new AuthorizationError("independent provider correction issuer");

  const scopeCondition=target.purpose==="completion_correction"
    ?and(
      eq(learningCompletionEvidenceBindings.noncreditRegistrationId,target.registrationId),
      eq(learningCompletionEvidenceBindings.expectedDecisionId,target.expectedDecisionId),
      eq(learningCompletionEvidenceBindings.approvedCorrectionOutcome,
        target.approvedCorrectionOutcome),
    )
    :eq(learningCompletionEvidenceBindings.awardIssuanceId,target.issuanceId);
  const bindings=await tx.select().from(learningCompletionEvidenceBindings)
    .where(and(
      eq(learningCompletionEvidenceBindings.purpose,target.purpose),
      eq(learningCompletionEvidenceBindings.evidenceVersionId,input.evidenceVersionId),
      scopeCondition,
    )).limit(2);
  const bound=bindings[0];
  if (bindings.length!==1 || !bound ||
      bound.participantPersonId!==input.participantPersonId ||
      bound.providerOrganizationId!==input.organizationId ||
      bound.deliverySiteId!==input.deliverySiteId ||
      bound.reviewReason!==input.reason ||
      bound.submittedByPersonId!==input.actorPersonId ||
      bound.approvedByPersonId===input.actorPersonId ||
      bound.approvedByPersonId===input.participantPersonId ||
      bound.approvedByPersonId===bound.submittedByPersonId)
    throw new AuthorizationError("independently approved evidence for exact Person and source");

  const now=new Date();
  if (!bound.approvedAt || bound.approvedAt>now)
    throw new AuthorizationError("current independently approved source evidence");
  const [evidence]=await tx.select({
    verifiedAt:evidenceDocumentVersions.verifiedAt,
    verifiedByPersonId:evidenceDocumentVersions.verifiedByPersonId,
    validFrom:evidenceDocumentVersions.validFrom,
    validThrough:evidenceDocumentVersions.validThrough,
    owningOrganizationId:evidenceDocuments.owningOrganizationId,
  }).from(evidenceDocumentVersions)
    .innerJoin(evidenceDocuments,eq(evidenceDocuments.id,evidenceDocumentVersions.documentId))
    .where(eq(evidenceDocumentVersions.id,input.evidenceVersionId)).limit(1);
  const today=now.toISOString().slice(0,10);
  if (!evidence || evidence.owningOrganizationId!==input.organizationId ||
      !evidence.verifiedAt || evidence.verifiedAt>now ||
      evidence.verifiedAt>bound.approvedAt ||
      !evidence.verifiedByPersonId ||
      evidence.verifiedByPersonId===input.participantPersonId ||
      evidence.verifiedByPersonId===input.actorPersonId ||
      (evidence.validFrom && evidence.validFrom>today) ||
      (evidence.validThrough && evidence.validThrough<today))
    throw new AuthorizationError("verified independent evidence bound to source");
}
