export type ReadinessDimension="academics"|"staffing"|"safeguarding"|"calendar"|"enrollment"|"records";
export type ReadinessItem={key:ReadinessDimension;label:string;state:"ready"|"needs_review"|"missing";detail:string;href:string};
export const readinessDimensions:ReadinessDimension[]=["academics","staffing","safeguarding","calendar","enrollment","records"];
export function programReadiness(items:ReadinessItem[]){
 const byKey=new Map(items.map(i=>[i.key,i]));
 const missing=readinessDimensions.filter(k=>!byKey.has(k));
 const blockers=items.filter(x=>x.state!=="ready").length+missing.length;
 return {ready:items.filter(x=>x.state==="ready").length,total:readinessDimensions.length,blockers,launchReady:blockers===0};
}
export function readinessFromSnapshot(snapshot:Partial<Record<ReadinessDimension,"ready"|"needs_review"|"missing">>):ReadinessItem[]{
 const labels:Record<ReadinessDimension,string>={academics:"Course offering",staffing:"Staff qualifications",safeguarding:"Safety and supervision",calendar:"Academic calendar",enrollment:"Enrollment capacity",records:"School records"};
 const links:Record<ReadinessDimension,string>={academics:"/operations/launch",staffing:"/staff/teachers",safeguarding:"/profiles",calendar:"/operations/school-years",enrollment:"/admissions/capacity",records:"/operations"};
 return readinessDimensions.map(key=>({key,label:labels[key],state:snapshot[key]??"missing",detail:snapshot[key]==="ready"?"Illustrative readiness marker":"Requires review before launch",href:links[key]}));
}
