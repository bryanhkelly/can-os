export type CredentialReleaseGate = {
  actorPersonId:string|null;
  recipientPersonId:string;
  recipientEmail:string;
  accountEmail:string|null;
  recipientActive:boolean;
  expiresAt:Date;
  revokedAt:Date|null;
  now:Date;
  demoFacilitator:boolean;
};
/** The authenticated account must match the named, active recipient exactly. */
export function canDownloadAuthorizedCredential(input:CredentialReleaseGate):boolean {
  return !input.demoFacilitator && !!input.actorPersonId &&
    input.actorPersonId===input.recipientPersonId && input.recipientActive &&
    !!input.accountEmail?.trim() &&
    input.accountEmail.trim().toLowerCase()===input.recipientEmail.trim().toLowerCase() &&
    input.expiresAt.getTime()>input.now.getTime() && !input.revokedAt;
}

export const RELEASE_PURPOSES = ["student_request","authorized_guardian","transfer","postsecondary_admission","employment_verification","legal_requirement"] as const;
export type CredentialReleasePurpose = typeof RELEASE_PURPOSES[number];
export type CredentialReleaseReview = {
  issuerMatches:boolean;
  studentMatches:boolean;
  verifiedRecipient:boolean;
  trustedInstructions:boolean;
  validAuthorityEvidence:boolean;
  registrarApproved:boolean;
  demoActor:boolean;
  purpose:CredentialReleasePurpose;
  expiresAt:Date;
  now:Date;
};
export function canAuthorizeAcademicCredentialRelease(input:CredentialReleaseReview):boolean {
  return !input.demoActor && input.issuerMatches && input.studentMatches &&
    input.verifiedRecipient && input.trustedInstructions &&
    input.validAuthorityEvidence && input.registrarApproved &&
    RELEASE_PURPOSES.includes(input.purpose) &&
    input.expiresAt.getTime()>input.now.getTime() &&
    input.expiresAt.getTime()<=input.now.getTime()+30*86400000;
}

export type LiveTransferAuthority = {
 consentActive:boolean; consentMatchesStudent:boolean;
 consentMatchesGuardian:boolean; consentMatchesAction:boolean;
 consentMatchesDestination:boolean; consentMatchesProgram:boolean;
 relationshipActive:boolean; actionResolved:boolean;
 actionMatchesStudent:boolean; actionMatchesGuardian:boolean;
 actionMatchesConsent:boolean; actionCompleted:boolean;
 issuerMatches:boolean;
};
export function canRedeemTransferCredential(input:LiveTransferAuthority):boolean {
 return Object.values(input).every(value=>value===true);
}
export const EXTERNAL_SCHOOL_TO_SCHOOL_RELEASE_SUPPORTED=false as const;
