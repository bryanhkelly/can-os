/** A reserved place is a time-bound opportunity, never an entitlement.
 * Sending mail about it requires all fields to describe the SAME active
 * invitation. The email provider's receipt is not proof of enrollment.
 */
export function currentWaitlistEmailOpportunity(input:{
  waitlistStatus:string;
  invitationExpiresAt:Date|null;
  deliveryInvitationExpiresAt:Date;
  releaseStatus:string;
  releaseClosesAt:Date;
  now:Date;
}):boolean{
  const expiration=input.invitationExpiresAt;
  return input.waitlistStatus==="invited" &&
    expiration!==null &&
    Number.isFinite(expiration.getTime()) &&
    expiration.getTime()===input.deliveryInvitationExpiresAt.getTime() &&
    expiration.getTime()>input.now.getTime() &&
    input.releaseStatus==="published" &&
    input.releaseClosesAt.getTime()>input.now.getTime();
}
