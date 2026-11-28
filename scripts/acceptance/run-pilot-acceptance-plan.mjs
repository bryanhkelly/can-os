// Local orchestration only. Each child uses the existing branch-attested runner
// configuration and ordinary application HTTP/RPCs. No business writes here.
import {spawnSync} from "node:child_process";
import {setTimeout as delay} from "node:timers/promises";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";

const uuid=z.string().uuid();
const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const actor=z.object({email:z.string().email(),grantId:uuid,organizationId:uuid,privateAccessCode:z.string().optional()}).strict();
const meeting=z.object({requestId:uuid,agendaRequestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,assetVersionId:uuid,prompt:z.string().min(5).max(1000),choices:z.array(z.string().min(1).max(200)).min(2).max(8)}).strict();
const site=z.object({host:actor,manager:actor,classId:uuid,siteId:uuid,classOfferingVersionId:uuid,
 learners:z.array(z.object({actor,paired:z.boolean()}).strict()).min(2).max(20),
 meetings:z.array(meeting).length(4)}).strict();
const planSchema=z.object({pilot2:z.object({sites:z.array(site).length(2),from:day,to:day,
 relationship:z.object({owner:actor,recipient:actor,foreign:actor,siteId:uuid,metrics:z.array(z.object({metricKey:z.enum(["class.registrations","class.uniquePeople","noncredit.registrations","noncredit.distinctLearners"]),definitionVersion:z.string().min(1).max(64)}).strict()).min(1).max(4)}).strict()
}).strict().optional()}).strict();

export function parsePlan(raw){
 const p=planSchema.parse(JSON.parse(raw??"{}"));
 if(p.pilot2){
  const {sites,from,to,relationship}=p.pilot2;
  if(!(Date.parse(from)<Date.parse(to))||Date.parse(to)-Date.parse(from)>366*86400000)throw Error("Valid report window required");
  for(const key of ["classId","siteId","classOfferingVersionId"]){
   if(new Set(sites.map(s=>s[key])).size!==2)throw Error("Distinct Site and Class scopes required");
  }
  if(new Set(sites.map(s=>s.host.organizationId)).size!==2)throw Error("Independent Site organizations required");
  const learners=sites.flatMap(s=>s.learners.map(l=>l.actor.email));
  if(new Set(learners).size!==learners.length)throw Error("Distinct cohort actors required");
  const meetings=sites.flatMap(s=>s.meetings);
  for(const key of ["requestId","agendaRequestId"])if(new Set(meetings.map(m=>m[key])).size!==8)throw Error("Eight distinct meeting commands required");
  for(const s of sites){
   if(s.manager.organizationId!==s.host.organizationId||!s.learners.some(l=>l.paired)||!s.learners.some(l=>!l.paired))throw Error("Exact provider manager, paired and no-device participants required");
   const sorted=[...s.meetings].sort((a,b)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
   for(const [i,m] of sorted.entries()){
    const start=Date.parse(m.startsAt),end=Date.parse(m.endsAt);
    if(end-start<15*60000||end-start>8*3600000||start<Date.parse(from)||end>Date.parse(to)||i>0&&start<Date.parse(sorted[i-1].endsAt))throw Error("Nonoverlapping report-covered meeting windows required");
   }
  }
  if(!sites.some(s=>s.siteId===relationship.siteId&&s.host.organizationId===relationship.owner.organizationId))throw Error("Relationship must cover a pilot Site");
 }
 return p;
}
export async function runPilotAcceptance({mode,env,root,modes}){
 const summary={mode,revision:env.CAN_RELEASE_SOURCE_SHA,stages:[],status:"blocked",nationalDisclosure:"not tested"};
 const run=(name,command,extra={})=>{
  console.log("START "+name);
  const start=Date.now();
  const result=spawnSync(process.execPath,modes[command],{cwd:root,env:{...env,...extra},stdio:"inherit"});
  const passed=result.status===0&&!result.error;
  summary.stages.push({name,status:passed?"passed":"failed",elapsedMs:Date.now()-start});
  if(!passed)throw Error("Stage failed: "+name);
 };
 const governed=(name,payload)=>run(name,"governed",{CAN_PILOT_QA_GOVERNED_JSON:JSON.stringify(payload)});
 try{
  const plan=parsePlan(env.CAN_PILOT_QA_PLAN_JSON||"{}");
  if(mode!=="pilot1"&&!plan.pilot2)throw Error("Reviewed Pilot 2 plan required");
  if(mode!=="pilot2"&&(!env.CAN_PILOT_QA_FIXTURE_JSON||!env.CAN_PILOT_QA_API_ACTORS_JSON))throw Error("Reviewed Pilot 1 fixture and email-link actors required");
  run("schema","schema");
  run("fresh provisioning and authentication","provision");
  if(mode!=="pilot2")run("Pilot 1 complete API journey","api");
  if(mode!=="pilot1"){
   const {sites,relationship,from,to}=plan.pilot2;
   const sql=neon(env.TEST_DATABASE_URL);
   // Preflight read-only: no existing enrollments or scheduled Sessions are
   // allowed. A failed run is retained as evidence, not silently replayed.
   for(const s of sites){
    const [state]=await sql`SELECT
      (SELECT count(*)::int FROM public.class_enrollments WHERE class_id=${s.classId}::uuid) AS enrollments,
      (SELECT count(*)::int FROM public.class_sessions WHERE class_id=${s.classId}::uuid) AS sessions`;
    if(state?.enrollments!==0||state?.sessions!==0)throw Error("Pilot 2 requires fresh Classes; preserve partial runs");
   }
   if(sites.some(s=>s.meetings.some(m=>Date.parse(m.startsAt)<Date.now()+5*60000)))throw Error("Choose fresh future meeting windows");
   governed("Pilot 2 enroll both Sites",{stage:"enroll-cohort",sites:sites.map(s=>({classId:s.classId,siteId:s.siteId,ownerOrganizationId:s.host.organizationId,classOfferingVersionId:s.classOfferingVersionId,creditMode:"not_applicable",learners:s.learners.map(l=>l.actor)}))});
   governed("Pilot 2 schedule both Sites",{stage:"schedule",sites:sites.map(s=>({host:s.host,classId:s.classId,siteId:s.siteId,meetings:s.meetings.map(({requestId,agendaRequestId,startsAt,endsAt,lessonId})=>({requestId,agendaRequestId,startsAt,endsAt,lessonId}))}))});
   const cohorts=[];
   for(const s of sites){
    const learners=[];
    for(const l of s.learners){
     const rows=await sql`SELECT e.course_attempt_id::text AS attempt FROM public.class_enrollments e
       JOIN public.access_accounts a ON a.person_id=e.learner_person_id
       WHERE e.class_id=${s.classId}::uuid AND a.email_normalized=${l.actor.email} AND e.status='active'`;
     if(rows.length!==1||!uuid.safeParse(rows[0].attempt).success)throw Error("Exact enrollment reconciliation failed");
     learners.push({...l,courseAttemptId:rows[0].attempt});
    }
    const sessionIds=[];
    for(const m of s.meetings){
     const rows=await sql`SELECT id::text FROM public.class_sessions WHERE class_id=${s.classId}::uuid AND request_id=${m.requestId}::uuid`;
     if(rows.length!==1)throw Error("Exact scheduled Session reconciliation failed");
     sessionIds.push(rows[0].id);
    }
    cohorts.push({s,learners,sessionIds});
   }
   const tasks=cohorts.flatMap((c,i)=>c.s.meetings.map((m,j)=>({c,i,m,j}))).sort((a,b)=>Date.parse(a.m.startsAt)-Date.parse(b.m.startsAt));
   for(const {c,i,m,j} of tasks){
    const wait=Math.max(0,Date.parse(m.startsAt)-Date.now());
    if(wait>0){console.log("Waiting for ordinary scheduled meeting window: "+m.startsAt);await delay(wait);}
    if(Date.now()>=Date.parse(m.endsAt))throw Error("Missed authorized meeting window; no clock override");
    governed("Pilot 2 Site "+(i+1)+" meeting "+(j+1),{stage:"deliver",host:c.s.host,classId:c.s.classId,siteId:c.s.siteId,classSessionId:c.sessionIds[j],learners:c.learners,foreign:cohorts[1-i].learners[0],instruction:{lessonId:m.lessonId,assetVersionId:m.assetVersionId,prompt:m.prompt,choices:m.choices}});
   }
   governed("Pilot 2 provider report reconciliation",{stage:"cohort-report",from,to,sites:cohorts.map(c=>({manager:c.s.manager,classId:c.s.classId,siteId:c.s.siteId,sessionIds:c.sessionIds,expectedDistinctPeople:c.learners.length,expectedPresentOccurrences:4*c.learners.filter(l=>l.paired).length}))});
   governed("Site reporting relationship acceptance and revocation",{stage:"relationships",...relationship});
  }
  summary.status="passed";
 }catch(error){
  // Zod input and driver errors may embed private fixture values. Never echo them.
  console.error("Acceptance stopped; inspect the failed stage and reviewed prerequisites. No business bypass attempted.");
 }finally{
  console.log(JSON.stringify(summary,null,2));
 }
 return summary.status==="passed"?0:1;
}
