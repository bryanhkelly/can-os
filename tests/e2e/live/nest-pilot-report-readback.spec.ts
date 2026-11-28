import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid(),n=z.number().int().nonnegative();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid}).strict();
const counts=z.object({registrations:n.min(2),uniquePeople:n.min(2),sessionsScheduled:n,sessionsDelivered:n,verifiedAttendance:n,verifiedAttendees:n,assessmentsSubmitted:n,assessmentsFinalized:n,formalCompletions:n}).strict();
const cohort=z.object({classId:uuid,mode:z.enum(["independent","facilitated"]),expected:counts}).strict();
const fixture=z.object({attestation:z.literal("reviewed-synthetic-pilot-report-readback"),from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),sites:z.array(z.object({actor,cohorts:z.array(cohort).length(2)}).strict()).length(2)}).strict().superRefine((f,ctx)=>{
 const [a,b]=f.sites;
 const invalid=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:"Independent sites, two pilot modes, bounded report window and explicit cohort counts required"});
 if(!a||!b||["email","grantId","personId","organizationId","siteId"].some(k=>a.actor[k as keyof typeof a.actor]===b.actor[k as keyof typeof b.actor]))invalid();
 if(new Set(f.sites.flatMap(s=>s.cohorts.map(c=>c.classId))).size!==4)invalid();
 if(!(Date.parse(f.to)>Date.parse(f.from))||Date.parse(f.to)-Date.parse(f.from)>366*86400000)invalid();
 for(const s of f.sites){
  if(new Set(s.cohorts.map(c=>c.mode)).size!==2)invalid();
  for(const c of s.cohorts){
   if(c.expected.uniquePeople>c.expected.registrations||c.expected.formalCompletions>c.expected.uniquePeople||c.expected.assessmentsFinalized>c.expected.assessmentsSubmitted)invalid();
   if(c.mode==="facilitated"&&(c.expected.sessionsScheduled!==4||c.expected.sessionsDelivered!==4||c.expected.verifiedAttendees<2||c.expected.verifiedAttendance<2))invalid();
   if(c.mode==="independent"&&(c.expected.sessionsScheduled!==0||c.expected.sessionsDelivered!==0))invalid();
   if(c.expected.formalCompletions<1||c.expected.assessmentsFinalized<2)invalid();
  }
 }
});
const f=fixture.parse(JSON.parse(process.env.CAN_NEST_REPORT_QA_JSON||"null"));
const origin="http://localhost:3001",api=origin+"/api/v1";
test("both pilot modes: exact provider counts, two-tenant denial and no implied disclosure",async()=>{
 const clients:APIRequestContext[]=[];
 const url=(classId:string)=>api+"/classes/"+classId+"/report?"+new URLSearchParams({from:f.from,to:f.to});
 try{
  for(const site of f.sites){
   const c=await request.newContext();clients.push(c);
   const s=await authenticateQaActor({request:c},site.actor.email,undefined,"nest");
   const grant=s.grants.find(g=>g.id===site.actor.grantId);
   expect(grant).toMatchObject({personId:site.actor.personId,organizationId:site.actor.organizationId,siteId:site.actor.siteId});
   expect((await c.post(api+"/me/session/membership",{headers:{Origin:origin},data:{grantId:site.actor.grantId}})).status()).toBe(200);
   expect((await qaSession({request:c},"nest")).activeGrantId).toBe(site.actor.grantId);
  }
  for(const [i,site] of f.sites.entries()){
   const c=clients[i]!;
   for(const cohort of site.cohorts){
    const response=await c.get(url(cohort.classId));
    expect(response.status()).toBe(200);
    const report=await response.json();
    expect(report).toMatchObject({classId:cohort.classId,operatorOrganizationId:site.actor.organizationId,deliverySiteId:site.actor.siteId,dataClassification:"synthetic",visibility:"authorized_provider_private",publicationApproved:false,metrics:cohort.expected});
    expect(new Set(report.definitions.map((d:{key:string})=>d.key)).size).toBe(report.definitions.length);
    const foreign=await clients[1-i]!.get(url(cohort.classId));
    expect(foreign.status()).toBe(403);
    expect((await foreign.json()).code).toBe("FORBIDDEN");
   }
  }
  for(const c of clients){
   expect((await c.post(api+"/access/logout",{headers:{Origin:origin},data:{}})).status()).toBe(204);
   expect((await c.get(url(f.sites[0]!.cohorts[0]!.classId))).status()).toBe(401);
  }
 }finally{await Promise.all(clients.map(c=>c.dispose()));}
});
