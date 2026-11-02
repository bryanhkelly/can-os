/** A custody restriction may be lifted only after a separately authorized
 * onsite staff proposal is reviewed by an independent appointed Site leader.
 * Human verification of the underlying outside evidence is still required;
 * a text reference alone does not establish legal validity.
 */
export function mayIndependentlyResolveCustodyHold(input:{
  kind:string;proposerPersonId:string|null;requesterPersonId:unknown;
  reviewerPersonId:string|null;resolutionNote:unknown;submittedNote:string;
  evidenceReference:unknown;authorityBasis:unknown;
}):boolean{
  if(!input.proposerPersonId||!input.reviewerPersonId ||
    input.proposerPersonId===input.reviewerPersonId ||
    input.requesterPersonId!==input.proposerPersonId ||
    input.resolutionNote!==input.submittedNote ||
    typeof input.evidenceReference!=="string" ||
    input.evidenceReference.trim().length<15)return false;
  const basis=input.authorityBasis;
  if(basis!=="verified_court_order" &&
     basis!=="verified_guardian_instructions" &&
     basis!=="documented_emergency_cleared")return false;
  return input.kind==="emergency"
    ?basis==="documented_emergency_cleared"
    :input.kind==="disputed_custody" && basis!=="documented_emergency_cleared";
}
