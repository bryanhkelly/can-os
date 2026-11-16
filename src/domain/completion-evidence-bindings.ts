/**
 * WS3 independently approved source-bound evidence matching.
 * A generic verified document is not a correction or revocation approval.
 * Provider adjudication still requires separately authenticated current
 * Site/issuer authority in its transactional command.
 */
export type CorrectionEvidenceTarget={
  purpose:"completion_correction";
  registrationId:string;
  expectedDecisionId:string;
  approvedCorrectionOutcome:"not_yet_completed"|"voided";
};
export type AwardEvidenceTarget={purpose:"award_revocation";issuanceId:string};
export type EvidenceTarget=CorrectionEvidenceTarget|AwardEvidenceTarget;
export type EvidenceBinding={
  purpose:"completion_correction"|"award_revocation";
  evidenceVersionId:string;
  noncreditRegistrationId:string|null;
  expectedDecisionId:string|null;
  approvedCorrectionOutcome:"not_yet_completed"|"voided"|null;
  awardIssuanceId:string|null;
  participantPersonId:string;
  providerOrganizationId:string;
  deliverySiteId:string;
  submittedByPersonId:string;
  approvedByPersonId:string;
  approvedAt:Date;
  reviewReason:string;
};
export type EvidenceClaim={
  evidenceVersionId:string;participantPersonId:string;
  organizationId:string;deliverySiteId:string;
  actorPersonId:string;reason:string;
};
export function matchesApprovedEvidenceBinding(
  binding:EvidenceBinding|null|undefined,
  target:EvidenceTarget,
  claim:EvidenceClaim,
  now:Date,
):boolean{
  if(!binding || !target || !claim ||
      !now || !Number.isFinite(now.getTime()) ||
      !binding.approvedAt || !Number.isFinite(binding.approvedAt.getTime()) ||
      binding.approvedAt>now ||
      !binding.evidenceVersionId ||
      binding.evidenceVersionId!==claim.evidenceVersionId ||
      binding.purpose!==target.purpose ||
      !claim.actorPersonId || !claim.participantPersonId ||
      claim.actorPersonId===claim.participantPersonId ||
      !binding.approvedByPersonId || !binding.submittedByPersonId ||
      binding.submittedByPersonId!==claim.actorPersonId ||
      binding.approvedByPersonId===claim.actorPersonId ||
      binding.approvedByPersonId===claim.participantPersonId ||
      binding.participantPersonId!==claim.participantPersonId ||
      binding.providerOrganizationId!==claim.organizationId ||
      binding.deliverySiteId!==claim.deliverySiteId ||
      !claim.organizationId || !claim.deliverySiteId ||
      binding.reviewReason!==claim.reason ||
      !claim.reason || claim.reason.trim().length<10)
    return false;
  if(target.purpose==="completion_correction")
    return binding.noncreditRegistrationId===target.registrationId &&
      binding.expectedDecisionId===target.expectedDecisionId &&
      binding.approvedCorrectionOutcome===target.approvedCorrectionOutcome &&
      binding.awardIssuanceId===null &&
      !!target.registrationId && !!target.expectedDecisionId;
  return binding.awardIssuanceId===target.issuanceId &&
    binding.noncreditRegistrationId===null &&
    binding.expectedDecisionId===null &&
    binding.approvedCorrectionOutcome===null && !!target.issuanceId;
}
