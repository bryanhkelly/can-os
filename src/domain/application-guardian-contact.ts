/**
 * The real guardian who submitted their own Application may be the prospective
 * contact, but a registrar-entered inquiry must never fall back to the
 * submitting registrar as its guardian.
 */
export function applicationGuardianContact(
 metadata:Record<string,unknown>,
 submittedByPersonId:string,
):string {
 return metadata.origin==="authenticated_guardian_application"
  ?submittedByPersonId
  :typeof metadata.contactPersonId==="string"?metadata.contactPersonId:"";
}
