/** Private noncredit source rollup. Exact canonical participant IDs stay
 * server-side; no name/email matching and no sum of distinct Site counts. */
export type NoncreditParticipantFact={registrationId:string;personId:string;siteId:string;releaseId:string;completed:boolean;verifiedAttendance:boolean};
type Counts={uniquePeople:number;uniqueCompletedPeople:number;uniqueVerifiedAttendees:number;repeatRegistrations:number};
type Bucket={registrations:number;people:Set<string>;completed:Set<string>;attended:Set<string>};
const emptyBucket=():Bucket=>({registrations:0,people:new Set(),completed:new Set(),attended:new Set()});
function add(bucket:Bucket,fact:NoncreditParticipantFact){
 bucket.registrations++;bucket.people.add(fact.personId);
 if(fact.completed)bucket.completed.add(fact.personId);
 if(fact.verifiedAttendance)bucket.attended.add(fact.personId);
}
function project(bucket:Bucket):Counts{return {uniquePeople:bucket.people.size,uniqueCompletedPeople:bucket.completed.size,uniqueVerifiedAttendees:bucket.attended.size,repeatRegistrations:bucket.registrations-bucket.people.size};}
export function summarizeDistinctNoncreditParticipation(facts:readonly NoncreditParticipantFact[]){
 const registrationIds=new Set<string>(),total=emptyBucket(),sites=new Map<string,Bucket>(),releases=new Map<string,Bucket>();
 const releaseSites=new Map<string,string>();
 for(const fact of facts){
  if(!fact.registrationId||!fact.personId||!fact.siteId||!fact.releaseId||registrationIds.has(fact.registrationId))throw new Error("Noncredit registration identity must reconcile exactly once");
  const priorSite=releaseSites.get(fact.releaseId);
  if(priorSite&&priorSite!==fact.siteId)throw new Error("Release assigned to conflicting Sites");
  releaseSites.set(fact.releaseId,fact.siteId);registrationIds.add(fact.registrationId);add(total,fact);
  for(const [map,key] of [[sites,fact.siteId],[releases,fact.releaseId]] as const){
   const bucket=map.get(key)??emptyBucket();add(bucket,fact);map.set(key,bucket);
  }
 }
 return {totals:project(total),empty:project(emptyBucket()),bySite:new Map([...sites].map(([id,b])=>[id,project(b)])),byRelease:new Map([...releases].map(([id,b])=>[id,project(b)]))};
}
