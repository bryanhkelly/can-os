export type EnrollmentRequirement={title:string;status:string;blocking:boolean};
export function enrollmentReadiness(requirements:EnrollmentRequirement[]){
 const blockers=requirements.filter(x=>x.blocking&&x.status!=="complete");
 return {total:requirements.length,completed:requirements.filter(x=>x.status==="complete").length,blockers:blockers.length,ready:blockers.length===0,missing:blockers.map(x=>x.title)};
}
