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
