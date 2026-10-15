export type OfferStatus="draft"|"issued"|"accepted"|"declined"|"expired"|"revoked";
export type OfferAction="issue"|"accept"|"decline"|"expire"|"revoke";
export type OfferRecord={status:OfferStatus;expiresAt:string|null;schoolYearId:string;applicationId:string};
const transitions:Record<OfferAction,{from:OfferStatus[];to:OfferStatus}>={
 issue:{from:["draft"],to:"issued"},
 accept:{from:["issued"],to:"accepted"},
 decline:{from:["issued"],to:"declined"},
 expire:{from:["issued"],to:"expired"},
 revoke:{from:["draft","issued"],to:"revoked"}
};
export function transitionAdmissionsOffer(offer:OfferRecord,action:OfferAction,now:Date):OfferRecord{
 if(!Number.isFinite(now.getTime()))throw new Error("Invalid timestamp");
 if(!offer.schoolYearId||!offer.applicationId)throw new Error("Offer must identify an application and school year");
 const transition=transitions[action];
 if(!transition.from.includes(offer.status))throw new Error("Invalid offer transition");
 const expiry=offer.expiresAt?new Date(offer.expiresAt):null;
 if(expiry&&!Number.isFinite(expiry.getTime()))throw new Error("Invalid offer expiration");
 if(action==="issue"&&expiry&&expiry.getTime()<=now.getTime())throw new Error("Cannot issue an expired offer");
 if(action==="accept"&&expiry&&expiry.getTime()<=now.getTime())throw new Error("Offer expired");
 if(action==="expire"&&(!expiry||expiry.getTime()>now.getTime()))throw new Error("Offer is not expired");
 return {...offer,status:transition.to};
}
export function offerHoldsSeat(offer:OfferRecord,now:Date):boolean{
 if(offer.status!=="issued"&&offer.status!=="accepted")return false;
 if(offer.status==="accepted")return true;
 if(!offer.expiresAt)return true;
 const expiry=new Date(offer.expiresAt);
 return Number.isFinite(expiry.getTime())&&expiry.getTime()>now.getTime();
}
