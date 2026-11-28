import {test} from "node:test";
import assert from "node:assert/strict";
import {validateReceipts} from "./nest-pilot2-receipts.mjs";
const revision="a".repeat(40),uuid=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
function fixture(){
 const schedule={revision,deliveryVerified:false,sites:[0,1].map(i=>({siteId:uuid(1+i),classId:uuid(3+i),sessions:[0,1,2,3].map(j=>({classSessionId:uuid(10+i*4+j),requestId:uuid(20+i*4+j)}))}))};
 const deliveries=schedule.sites.flatMap(s=>s.sessions.map(r=>({...r,revision,siteId:s.siteId,classId:s.classId,roomClosed:true,participants:3,paired:1,corrected:1,playbackVerified:false})));
 return {schedule,deliveries};
}
test("eight distinct exact-revision sessions prove control slice only",()=>{
 const {schedule,deliveries}=fixture(),result=validateReceipts(revision,schedule,deliveries);
 assert.equal(result.controlJourneyPassed,true);assert.equal(result.deliveredControlSessions,8);
 assert.equal(result.participantOccurrences,24);assert.equal(result.playbackVerified,false);assert.equal(result.fullPilotPassed,false);
});
test("partial coverage reports missing session and cannot pass",()=>{
 const {schedule,deliveries}=fixture();const r=validateReceipts(revision,schedule,deliveries.slice(0,7));
 assert.equal(r.controlJourneyPassed,false);assert.deepEqual(r.missingSessions,[deliveries[7].classSessionId]);
});
test("stale, duplicate, wrong site, wrong request, sensitive extra fields and fake playback fail closed",()=>{
 const {schedule,deliveries}=fixture();
 for(const patch of [{revision:"b".repeat(40)},{siteId:uuid(99)},{requestId:uuid(99)},{playbackVerified:true},{roomClosed:false},{paired:3},{corrected:0},{token:"not allowed"}])
  assert.throws(()=>validateReceipts(revision,schedule,[{...deliveries[0],...patch},...deliveries.slice(1)]));
 assert.throws(()=>validateReceipts(revision,schedule,[deliveries[0],deliveries[0],...deliveries.slice(2)]));
 schedule.sites[1].sessions[0].requestId=schedule.sites[0].sessions[0].requestId;
 assert.throws(()=>validateReceipts(revision,schedule,deliveries));
});
