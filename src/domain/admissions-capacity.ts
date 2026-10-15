export type CapacityPolicy={seats:number|null;waitlistEnabled:boolean};
export type CapacityAssessment={capacity:number|null;enrolled:number;offered:number;remaining:number|null;status:"open"|"full"|"waitlist"|"unconfigured"};
export function assessAdmissionsCapacity(policy:CapacityPolicy,enrolled:number,offered:number):CapacityAssessment{
 if(!Number.isInteger(enrolled)||enrolled<0||!Number.isInteger(offered)||offered<0)throw new Error("Invalid occupancy");
 if(policy.seats===null)return {capacity:null,enrolled,offered,remaining:null,status:"unconfigured"};
 if(!Number.isInteger(policy.seats)||policy.seats<0)throw new Error("Invalid seat capacity");
 const remaining=Math.max(0,policy.seats-enrolled-offered);
 return {capacity:policy.seats,enrolled,offered,remaining,status:remaining>0?"open":policy.waitlistEnabled?"waitlist":"full"};
}
export function readCapacityPolicy(metadata:Record<string,unknown>):CapacityPolicy{
 const raw=metadata.admissionsCapacity;
 if(!raw||typeof raw!=="object")return {seats:null,waitlistEnabled:false};
 const data=raw as Record<string,unknown>;
 return {seats:typeof data.seats==="number"?data.seats:null,waitlistEnabled:data.waitlistEnabled===true};
}
