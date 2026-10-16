import {defineLifecycle} from "@/platform/lifecycle";
import {offerHoldsSeat as holdsSeat} from "./admissions-policy";
export type OfferStatus="draft"|"issued"|"accepted"|"declined"|"expired"|"revoked";
export type OfferAction="issue"|"accept"|"decline"|"expire"|"revoke";
export type OfferRecord={status:OfferStatus;expiresAt:string|null;schoolYearId:string;applicationId:string};
export const offerLifecycle=defineLifecycle<OfferStatus,OfferAction>({
 states:["draft","issued","accepted","declined","expired","revoked"],
 transitions:{
  issue:{from:["draft"],to:"issued"},
  accept:{from:["issued"],to:"accepted"},
  decline:{from:["issued"],to:"declined"},
  expire:{from:["issued"],to:"expired"},
  revoke:{from:["draft","issued"],to:"revoked"}
 }
});
export function transitionAdmissionsOffer(offer:OfferRecord,action:OfferAction,now:Date):OfferRecord{
 if(!Number.isFinite(now.getTime()))throw new Error("Invalid timestamp");
 if(!offer.schoolYearId||!offer.applicationId)throw new Error("Offer must identify an application and school year");
 if(!offerLifecycle.can(offer.status,action))throw new Error("Invalid offer transition");
 const nextStatus=offerLifecycle.apply(offer.status,action);
 const expiry=offer.expiresAt?new Date(offer.expiresAt):null;
 if(expiry&&!Number.isFinite(expiry.getTime()))throw new Error("Invalid offer expiration");
 if(action==="issue"&&expiry&&expiry.getTime()<=now.getTime())throw new Error("Cannot issue an expired offer");
 if(action==="accept"&&expiry&&expiry.getTime()<=now.getTime())throw new Error("Offer expired");
 if(action==="expire"&&(!expiry||expiry.getTime()>now.getTime()))throw new Error("Offer is not expired");
 return {...offer,status:nextStatus};
}
export function offerHoldsSeat(offer:OfferRecord,now:Date):boolean{
 return holdsSeat(offer,now);
}
