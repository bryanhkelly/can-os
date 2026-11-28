/**
 * Standard HTTP acceptance journey. Requires a verified registrar/site_admin
 * cookie obtained from normal sign-in on a disposable non-production tenant.
 * This script creates two real operational Actions and resolves them, leaving
 * normal audit/outbox evidence. Never use a production tenant.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const base=process.env.WS10_TEST_API_ORIGIN;
const cookie=process.env.WS10_TEST_SESSION_COOKIE;
const siteId=process.env.WS10_TEST_SITE_ID;
if(process.env.WS10_CONFIRM_DISPOSABLE_TENANT!=="yes"||!base||!cookie||!siteId)
 throw new Error("Explicit disposable tenant confirmation, API origin, normal session cookie and Site ID required");
const origin=new URL(base);
if(!["http:","https:"].includes(origin.protocol)||origin.pathname!=="/"||origin.search||origin.hash||origin.username||origin.password)
 throw new Error("Provide the exact test ingress origin");
if(origin.protocol!=="https:"&&!["localhost","127.0.0.1","[::1]"].includes(origin.hostname))
 throw new Error("Remote acceptance requires HTTPS");
async function api(path,body){
 const response=await fetch(new URL("/api/v1/"+path,origin),{
  method:body===undefined?"GET":"POST",
  headers:{cookie,...(body===undefined?{}:{origin:origin.origin,"content-type":"application/json"})},
  ...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:"error",
 });
 const result=await response.json();
 return {status:response.status,data:result};
}
const expectOk=async(path,body)=>{
 const r=await api(path,body);
 assert.equal(r.status,200,path+" did not succeed");
 return r.data;
};
const prefix="WS10 acceptance "+randomUUID();
const create=title=>({requestId:randomUUID(),siteId,title:prefix+" "+title,ownerPersonId:null});
const first=create("A"),second=create("B");
const a=await expectOk("work/tasks",first);
const replay=await expectOk("work/tasks",first);
assert.equal(replay.actionId,a.actionId);assert.equal(replay.replayed,true);
assert.equal((await api("work/tasks",{...first,title:prefix+" conflicting retry"})).status,409);
const b=await expectOk("work/tasks",second);
const route=id=>"work/tasks/"+id+"/dependencies";
const [av,bv]=await Promise.all([expectOk(route(a.actionId)),expectOk(route(b.actionId))]);
const change=(target,other,revision,operation="add")=>api(route(target),{blockedByActionId:other,operation,expectedUpdatedAt:revision,reason:"Verify transactional dependency policy"});
const [ab,ba]=await Promise.all([change(a.actionId,b.actionId,av.updatedAt),change(b.actionId,a.actionId,bv.updatedAt)]);
assert.deepEqual([ab.status,ba.status].sort(),[200,409],"Concurrent opposing edges must not form a cycle");
const dependent=ab.status===200?a.actionId:b.actionId,blocker=ab.status===200?b.actionId:a.actionId;
const dep=await expectOk(route(dependent));
assert.equal(dep.blocked,true);assert.equal(dep.prerequisites.length,1);
assert.equal(dep.prerequisites[0].id,blocker);
const status=(id,value)=>api("operations/actions/"+id+"/status",{status:value,...(value==="resolved"?{resolutionNote:"WS10 authenticated acceptance completed"}:{})});
assert.equal((await status(dependent,"in_progress")).status,409);
assert.equal((await status(dependent,"resolved")).status,409);
const duplicate=await change(dependent,blocker,dep.updatedAt);
assert.equal(duplicate.status,200);assert.equal(duplicate.data.changed,false);
assert.equal((await status(blocker,"resolved")).status,200);
assert.equal((await expectOk(route(dependent))).blocked,false);
assert.equal((await status(dependent,"in_progress")).status,200);
assert.equal((await status(dependent,"resolved")).status,200);
assert.equal((await status(dependent,"resolved")).status,200);
assert.equal((await change(dependent,blocker,dep.updatedAt,"remove")).status,409);
console.log("WS10 standard API acceptance passed: creation replay, conflict, concurrent cycle prevention, blocked status, completion, closed graph");
