import {offerHoldsSeat} from "./admissions-policy";
export type OfferCandidate={id:string;status:string;expiresAt:string|null;schoolYearId:string};
export function isLiveOffer(offer:OfferCandidate,now=new Date()):boolean {
 return offerHoldsSeat(offer,now);
}
export function selectActionableOffer<T extends OfferCandidate>(offers:T[],now=new Date()):T|undefined {
 return offers.find(offer=>isLiveOffer(offer,now));
}
export function canIssueAnotherOffer(stage:string,blockingRequirements:number,offers:OfferCandidate[],schoolYearId:string,now=new Date(),disposition?:string|null):boolean {
 return disposition!=="waitlisted"&&(stage==="application"||stage==="eligibility")&&blockingRequirements===0&&!offers.some(offer=>offer.schoolYearId===schoolYearId&&isLiveOffer(offer,now));
}
