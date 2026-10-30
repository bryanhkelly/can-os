import {assessAdmissionsCapacity,type CapacityPolicy} from "./admissions-capacity";
export type OfferEligibility={eligible:boolean;reason:"eligible"|"invalid_stage"|"requirements_incomplete"|"capacity_unconfigured"|"capacity_full"|"waitlist_available"};
export function evaluateOfferEligibility(input:{stage:string;requirementsReady:boolean;policy:CapacityPolicy;enrolled:number;otherOutstandingOffers:number}):OfferEligibility{
 if(input.stage!=="application"&&input.stage!=="eligibility")return {eligible:false,reason:"invalid_stage"};
 if(!input.requirementsReady)return {eligible:false,reason:"requirements_incomplete"};
 const capacity=assessAdmissionsCapacity(input.policy,input.enrolled,input.otherOutstandingOffers);
 if(capacity.status==="unconfigured")return {eligible:false,reason:"capacity_unconfigured"};
 if(capacity.status==="waitlist")return {eligible:false,reason:"waitlist_available"};
 if(capacity.status==="full")return {eligible:false,reason:"capacity_full"};
 return {eligible:true,reason:"eligible"};
}
