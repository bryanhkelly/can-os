import {test,expect,type BrowserContext} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
import {pilotRpcPage,pilotRpc as rpc,expectPilotDenial as deny} from "../helpers/pilot-governed-rpc";

const uuid=z.string().uuid();
const actor=z.object({email:z.string().email().refine(x=>x===x.toLowerCase()&&x.endsWith(".test")),grantId:uuid,organizationId:uuid}).strict();
const fixture=z.object({manager:actor,primary:actor,backup:actor,foreign:actor,
  classId:uuid,siteId:uuid,classSessionId:uuid,liveClassSessionId:uuid.optional(),
  replacement:z.object({requestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,agendaRequestId:uuid}).strict()}).strict()
  .parse(JSON.parse(process.env.CAN_FACILITATOR_QA_JSON??"{}"));
const branch="br-solitary-art-arun91gj";
const sql=neon(process.env.TEST_DATABASE_URL!);

test("exact Site manager cancellation and independently authenticated backup scheduling",async({browser})=>{
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch});
  const {manager,primary,backup,foreign,classId,siteId,classSessionId,replacement}=fixture;
  expect(new Set([manager,primary,backup,foreign].map(a=>a.email)).size).toBe(4);
  expect(primary.organizationId).toBe(manager.organizationId);
  expect(backup.organizationId).toBe(manager.organizationId);
  expect(foreign.organizationId).not.toBe(manager.organizationId);
  const [scope]=await sql`SELECT count(*)::int AS count FROM public.classes c
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
    JOIN public.organizations o ON o.id=c.operating_organization_id
    WHERE c.id=${classId}::uuid AND s.id=${siteId}::uuid AND o.id=${manager.organizationId}::uuid
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch} AND c.state='active'`;
  expect(scope?.count).toBe(1);
  const contexts:BrowserContext[]=[];
  async function login(a:z.infer<typeof actor>){
    const [proof]=await sql`SELECT count(*)::int AS count FROM public.access_accounts ac
      JOIN public.people p ON p.id=ac.person_id JOIN public.organizations o ON o.id=${a.organizationId}::uuid
      WHERE ac.email_normalized=${a.email} AND NOT ac.disabled AND p.active AND ac.email_verified_at IS NOT NULL
      AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}`;
    expect(proof?.count).toBe(1);
    const context=await browser.newContext();contexts.push(context);
    const initial=await authenticateQaActor(context,a.email);
    expect(initial.grants.find(g=>g.id===a.grantId)?.organizationId).toBe(a.organizationId);
    if(initial.activeGrantId!==a.grantId){
      const response=await context.request.post("http://localhost:5183/access/session",{headers:{Origin:"http://localhost:5183"},data:{grantId:a.grantId}});
      expect(response.ok()).toBe(true);
    }
    const session=await qaSession(context);expect(session.activeGrantId).toBe(a.grantId);
    return {page:await pilotRpcPage(context),session,grant:session.grants.find(g=>g.id===a.grantId)!};
  }
  try{
    const m=await login(manager),p=await login(primary),b=await login(backup),f=await login(foreign);
    expect(["site_admin","registrar"]).toContain(m.session.role);
    expect(p.session.role).toBe("room_facilitator");expect(b.session.role).toBe("room_facilitator");
    expect(new Set([m,p,b,f].map(x=>x.grant.personId)).size).toBe(4);
    for(const x of [m,p,b])expect(x.grant.siteId).toBe(siteId);
    const [before]=await sql`SELECT s.facilitator_person_id,p.state,p.facilitated_session_id,d.starts_at
      FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
      JOIN public.delivery_sessions d ON d.id=s.delivery_session_id
      WHERE s.id=${classSessionId}::uuid AND s.class_id=${classId}::uuid`;
    expect(before).toMatchObject({facilitator_person_id:p.grant.personId,state:"scheduled",facilitated_session_id:null});
    expect(new Date(String(before?.starts_at)).getTime()).toBeGreaterThan(Date.now());
    const cancel={classId,classSessionId,requestId:randomUUID(),reason:"Synthetic QA unavailable primary facilitator",replacement:null};
    await deny(f.page,"session","changeNativeClassSessionSchedule",cancel);
    await deny(b.page,"session","changeNativeClassSessionSchedule",cancel);
    expect(await rpc(m.page,"session","changeNativeClassSessionSchedule",cancel)).toMatchObject({changed:true,duplicate:false,cancelledSessionId:classSessionId,replacementSessionId:null});
    expect(await rpc(m.page,"session","changeNativeClassSessionSchedule",cancel)).toMatchObject({changed:true,duplicate:true});
    await deny(p.page,"session","openNativeClassSession",{classId,classSessionId});
    const {requestId,startsAt,endsAt,lessonId,agendaRequestId}=replacement;
    const created=await rpc<{sessions:{classSessionId:string}[]}>(b.page,"session","scheduleNativeClassSessions",{classId,cadence:"custom",meetings:[{requestId,startsAt,endsAt}]});
    expect(created.sessions).toHaveLength(1);
    const next=created.sessions[0]!.classSessionId;expect(next).not.toBe(classSessionId);
    expect(await rpc(b.page,"agenda","publishNativeClassSessionAgenda",{classId,classSessionId:next,requestId:agendaRequestId,expectedRevisionNo:0,items:[{kind:"watch",referenceId:lessonId}]})).toMatchObject({classSessionId:next});
    await deny(p.page,"session","openNativeClassSession",{classId,classSessionId:next});
    const rows=await sql`SELECT s.id,s.facilitator_person_id,p.state,p.facilitated_session_id
      FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
      WHERE s.id=ANY(${[classSessionId,next]}::uuid[])`;
    expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.id===classSessionId)).toMatchObject({facilitator_person_id:p.grant.personId,state:"cancelled",facilitated_session_id:null});
    expect(rows.find(row=>row.id===next)).toMatchObject({facilitator_person_id:b.grant.personId,state:"scheduled",facilitated_session_id:null});
    if(fixture.liveClassSessionId){
      const sessionId=fixture.liveClassSessionId;
      expect(sessionId).not.toBe(classSessionId);
      const [live]=await sql`SELECT s.facilitator_person_id,p.facilitated_session_id,r.state
        FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
        JOIN public.facilitated_learning_sessions r ON r.id=p.facilitated_session_id
        WHERE s.id=${sessionId}::uuid AND s.class_id=${classId}::uuid`;
      expect(live).toMatchObject({facilitator_person_id:p.grant.personId,state:"live"});
      const roomId=uuid.parse(live?.facilitated_session_id);
      const scope={facilitatedSessionId:roomId};
      const transfer={classId,classSessionId:sessionId,requestId:randomUUID(),expectedFacilitatorPersonId:p.grant.personId,toPersonId:b.grant.personId,reason:"Synthetic QA live facilitator continuity"};
      await deny(b.page,"roomControl","transferNativeClassroomControl",transfer);
      await deny(f.page,"roomControl","transferNativeClassroomControl",transfer);
      await deny(b.page,"room","renewFacilitatedLearningPairing",scope);
      expect(await rpc(m.page,"roomControl","transferNativeClassroomControl",transfer)).toMatchObject({transferred:true,duplicate:false,facilitatedSessionId:roomId,currentFacilitatorPersonId:b.grant.personId});
      expect(await rpc(m.page,"roomControl","transferNativeClassroomControl",transfer)).toMatchObject({transferred:true,duplicate:true});
      await deny(m.page,"roomControl","transferNativeClassroomControl",{...transfer,requestId:randomUUID()});
      await deny(p.page,"room","renewFacilitatedLearningPairing",scope);
      await deny(p.page,"session","openNativeClassSession",{classId,classSessionId:sessionId});
      expect(await rpc(b.page,"session","openNativeClassSession",{classId,classSessionId:sessionId})).toMatchObject({alreadyStarted:true,facilitatedSessionId:roomId});
      expect(await rpc(b.page,"room","renewFacilitatedLearningPairing",scope)).toMatchObject(scope);
      const [after]=await sql`SELECT s.facilitator_person_id AS original,r.facilitator_person_id AS controller,p.facilitated_session_id
        FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
        JOIN public.facilitated_learning_sessions r ON r.id=p.facilitated_session_id WHERE s.id=${sessionId}::uuid`;
      expect(after).toMatchObject({original:p.grant.personId,controller:b.grant.personId,facilitated_session_id:roomId});
      expect(await rpc(b.page,"room","endFacilitatedLearningRoom",scope)).toMatchObject({ended:true});
    }
    const workspace=await rpc<{rooms:Record<string,unknown>[]}>(b.page,"room","getFacilitatedHostWorkspace");
    for(const room of workspace.rooms)expect(room).not.toHaveProperty("pairingCodeDigest");
  }finally{await Promise.all(contexts.map(c=>c.close()));}
});
