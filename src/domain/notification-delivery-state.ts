/** Outbound provider acceptance is not proof of inbox delivery, reading,
 * enrollment, attendance or completion. Terminal and expiry states are
 * projected from the original outbox receipt and live invitation.
 */
export type WaitlistReceiptState = "pending"|"processing"|"accepted"|"failed"|"suppressed";
export type WaitlistDeliverySnapshot = {
 status:WaitlistReceiptState;
 invitationStatus:string;
 invitationExpiresAt:Date;
 currentInvitationExpiresAt:Date|null;
 acceptedAt:Date|null;
 nextAttemptAt:Date|null;
 attempts:number;
};
export function waitlistDeliveryView(row:WaitlistDeliverySnapshot,now:Date):{
 state:"pending"|"provider_accepted"|"retry_scheduled"|"failed"|"expired"|"suppressed";
 label:string;retryable:boolean;
}{
 if(row.status==="accepted"||row.acceptedAt){
   return {state:"provider_accepted",label:"Provider accepted (delivery unconfirmed)",retryable:false};
 }
 const live=row.invitationStatus==="invited"&&
   row.invitationExpiresAt.getTime()>now.getTime()&&
   row.currentInvitationExpiresAt?.getTime()===row.invitationExpiresAt.getTime();
 if(!live)return {state:"expired",label:"Expired or no longer eligible",retryable:false};
 if(row.status==="suppressed")return {state:"suppressed",label:"Suppressed after safety check",retryable:false};
 if(row.status==="processing")return {state:"pending",label:"Processing",retryable:false};
 if(row.status==="pending")return {state:"pending",label:"Queued",retryable:false};
 if(row.status==="failed"&&row.nextAttemptAt&&row.nextAttemptAt.getTime()>now.getTime())
   return {state:"retry_scheduled",label:"Retry scheduled",retryable:false};
 return {state:"failed",label:"Failed · operator retry available",retryable:true};
}
