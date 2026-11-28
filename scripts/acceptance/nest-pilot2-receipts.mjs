// Private QA receipt aggregation. A green classroom-control slice is not proof of playback or outcomes.
import {readFileSync,readdirSync,lstatSync} from "node:fs";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {execFileSync} from "node:child_process";
const id=v=>typeof v==="string"&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(v);
const sha=v=>typeof v==="string"&&/^[0-9a-f]{40}$/.test(v);
const int=v=>Number.isSafeInteger(v)&&v>=0;
const exact=(v,keys)=>v&&typeof v==="object"&&!Array.isArray(v)&&Object.keys(v).sort().join(",")===[...keys].sort().join(",");
function requireThat(ok,message){if(!ok)throw Error(message);}
export function validateReceipts(revision,schedule,deliveries){
 requireThat(sha(revision),"Exact revision required");
 requireThat(exact(schedule,["revision","sites","deliveryVerified"])&&schedule.revision===revision&&schedule.deliveryVerified===false&&Array.isArray(schedule.sites)&&schedule.sites.length===2,"Two-site schedule receipt required");
 const planned=new Map(),requests=new Set(),sites=new Set(),classes=new Set();
 for(const site of schedule.sites){
  requireThat(exact(site,["siteId","classId","sessions"])&&id(site.siteId)&&id(site.classId)&&Array.isArray(site.sessions)&&site.sessions.length===4,"Four sessions per Site required");
  requireThat(!sites.has(site.siteId)&&!classes.has(site.classId),"Duplicate Site or Class");sites.add(site.siteId);classes.add(site.classId);
  for(const s of site.sessions){
   requireThat(exact(s,["classSessionId","requestId"])&&id(s.classSessionId)&&id(s.requestId)&&!planned.has(s.classSessionId)&&!requests.has(s.requestId),"Duplicate or invalid planned session");
   requests.add(s.requestId);planned.set(s.classSessionId,{siteId:site.siteId,classId:site.classId,requestId:s.requestId});
  }
 }
 requireThat(Array.isArray(deliveries)&&deliveries.length<=8,"Invalid delivery receipt count");
 const delivered=new Set();let participantOccurrences=0,pairedOccurrences=0,correctedOccurrences=0;
 for(const r of deliveries){
  requireThat(exact(r,["revision","classId","siteId","classSessionId","requestId","roomClosed","participants","paired","corrected","playbackVerified"])&&r.revision===revision&&r.roomClosed===true&&r.playbackVerified===false,"Invalid or stale delivery receipt");
  const p=planned.get(r.classSessionId);
  requireThat(p&&p.siteId===r.siteId&&p.classId===r.classId&&p.requestId===r.requestId&&!delivered.has(r.classSessionId),"Unplanned, mismatched or duplicate delivery");
  requireThat(int(r.participants)&&r.participants>=2&&r.participants<=20&&int(r.paired)&&r.paired>=1&&r.paired<r.participants&&int(r.corrected)&&r.corrected>=1&&r.corrected<r.participants,"Invalid attendance coverage");
  delivered.add(r.classSessionId);participantOccurrences+=r.participants;pairedOccurrences+=r.paired;correctedOccurrences+=r.corrected;
 }
 return {revision,scheduledSessions:planned.size,deliveredControlSessions:delivered.size,missingSessions:[...planned.keys()].filter(k=>!delivered.has(k)),participantOccurrences,pairedOccurrences,correctedOccurrences,controlJourneyPassed:delivered.size===8,playbackVerified:false,fullPilotPassed:false};
}
export function readReceiptDirectory(directory,revision){
 const read=name=>{const p=join(directory,name);const st=lstatSync(p);requireThat(st.isFile()&&!st.isSymbolicLink()&&st.size<=65536,"Invalid receipt file");return JSON.parse(readFileSync(p,"utf8"));};
 const names=readdirSync(directory);
 const schedule=read("schedule.json");
 const deliveryNames=names.filter(n=>/^session-[0-9a-f-]{36}\.json$/i.test(n));
 const deliveries=deliveryNames.map(n=>{const r=read(n);requireThat(n==="session-"+r.classSessionId+".json","Receipt filename mismatch");return r;});
 return validateReceipts(revision,schedule,deliveries);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  if(process.argv.length!==3)throw Error("Pass one private receipt directory");
  const revision=execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim();
  requireThat(!execFileSync("git",["status","--porcelain"],{encoding:"utf8"}).trim(),"Clean exact checkout required");
  const result=readReceiptDirectory(process.argv[2],revision);
  console.log(JSON.stringify(result,null,2));process.exitCode=result.controlJourneyPassed?0:1;
 }catch{console.error("Blocked: missing, invalid or stale classroom receipt evidence");process.exitCode=1;}
}
