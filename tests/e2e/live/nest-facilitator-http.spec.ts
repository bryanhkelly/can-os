import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const origin="http://localhost:3001",api=origin+"/api/v1",headers={Origin:origin};
async function post<T=unknown>(http:APIRequestContext,path:string,data:unknown):Promise<T>{
 const res=await http.post(api+path,{headers,data});expect(res.status(),path).toBe(200);return await res.json() as T;
}
async function get<T=unknown>(http:APIRequestContext,path:string):Promise<T>{
 const res=await http.get(api+path);expect(res.status(),path).toBe(200);return await res.json() as T;
}
async function denyPost(http:APIRequestContext,path:string,data:unknown){
 const res=await http.post(api+path,{headers,data});expect(res.status(),path).toBe(403);expect((await res.json()).code).toBe("FORBIDDEN");
}
async function denyGet(http:APIRequestContext,path:string){
 const res=await http.get(api+path);expect(res.status(),path).toBe(403);expect((await res.json()).code).toBe("FORBIDDEN");
}

const uuid=z.string().uuid();
const actor=z.object({email:z.string().email().refine(x=>x===x.toLowerCase()&&x.endsWith(".test")),grantId:uuid,organizationId:uuid}).strict();
const fixture=z.object({manager:actor,primary:actor,backup:actor,foreign:actor,
  classId:uuid,siteId:uuid,classSessionId:uuid,liveClassSessionId:uuid,
  learner:actor,courseAttemptId:uuid,assetVersionId:uuid,
  replacement:z.object({requestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,agendaRequestId:uuid}).strict()}).strict()
  .parse(JSON.parse(process.env.CAN_FACILITATOR_QA_JSON??"{}"));
const branch="br-solitary-art-arun91gj";
const sql=neon(process.env.TEST_DATABASE_URL!);

test("ordinary REST cancellation, replacement and live facilitator takeover preserve actual learner evidence",async()=>{
  const [identity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(identity).toEqual({project:"sweet-hall-62441909",branch});
  const {manager,primary,backup,foreign,classId,siteId,classSessionId,replacement,learner,courseAttemptId,assetVersionId}=fixture;
  expect(new Set([manager,primary,backup,foreign,learner].map(a=>a.email)).size).toBe(5);
  expect(learner.organizationId).toBe(manager.organizationId);
  expect(primary.organizationId).toBe(manager.organizationId);
  expect(backup.organizationId).toBe(manager.organizationId);
  expect(foreign.organizationId).not.toBe(manager.organizationId);
  const [scope]=await sql`SELECT count(*)::int AS count FROM public.classes c
    JOIN public.sites s ON s.id=c.site_id AND s.organization_id=c.operating_organization_id
    JOIN public.organizations o ON o.id=c.operating_organization_id
    WHERE c.id=${classId}::uuid AND s.id=${siteId}::uuid AND o.id=${manager.organizationId}::uuid
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch} AND c.state='active'`;
  expect(scope?.count).toBe(1);
  const contexts:APIRequestContext[]=[];
  async function login(a:z.infer<typeof actor>){
    const [proof]=await sql`SELECT count(*)::int AS count FROM public.access_accounts ac
      JOIN public.people p ON p.id=ac.person_id JOIN public.organizations o ON o.id=${a.organizationId}::uuid
      WHERE ac.email_normalized=${a.email} AND NOT ac.disabled AND p.active AND ac.email_verified_at IS NOT NULL
      AND p.metadata->>'qa_only'='true' AND p.metadata->>'intended_branch'=${branch}
      AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'=${branch}`;
    expect(proof?.count).toBe(1);
    const http=await request.newContext();contexts.push(http);const context={request:http};
    const initial=await authenticateQaActor(context,a.email,undefined,"nest");
    expect(initial.grants.find(g=>g.id===a.grantId)?.organizationId).toBe(a.organizationId);
    if(initial.activeGrantId!==a.grantId){
      const response=await http.post(api+"/me/session/membership",{headers,data:{grantId:a.grantId}});
      expect(response.ok()).toBe(true);
    }
    const session=await qaSession(context,"nest");expect(session.activeGrantId).toBe(a.grantId);
    return {http,session,grant:session.grants.find(g=>g.id===a.grantId)!};
  }
  try{
    const m=await login(manager),p=await login(primary),b=await login(backup),f=await login(foreign),l=await login(learner);
    expect(l.session.role).toBe("student");
    expect(l.grant.siteId).toBe(siteId);
    const [enrolled]=await sql`SELECT count(*)::int AS count FROM public.class_enrollments
      WHERE class_id=${classId}::uuid AND learner_person_id=${l.grant.personId}::uuid
        AND course_attempt_id=${courseAttemptId}::uuid AND status='active'`;
    expect(enrolled?.count).toBe(1);
    expect(["site_admin","registrar"]).toContain(m.session.role);
    expect(p.session.role).toBe("room_facilitator");expect(b.session.role).toBe("room_facilitator");
    expect(new Set([m,p,b,f,l].map(x=>x.grant.personId)).size).toBe(5);
    for(const x of [m,p,b])expect(x.grant.siteId).toBe(siteId);
    const [before]=await sql`SELECT s.facilitator_person_id,p.state,p.facilitated_session_id,d.starts_at
      FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
      JOIN public.delivery_sessions d ON d.id=s.delivery_session_id
      WHERE s.id=${classSessionId}::uuid AND s.class_id=${classId}::uuid`;
    expect(before).toMatchObject({facilitator_person_id:p.grant.personId,state:"scheduled",facilitated_session_id:null});
    expect(new Date(String(before?.starts_at)).getTime()).toBeGreaterThan(Date.now());
    const cancel={classId,classSessionId,requestId:randomUUID(),reason:"Synthetic QA unavailable primary facilitator",replacement:null};
    await denyPost(f.http,"/class-session-schedule-changes",cancel);
    await denyPost(b.http,"/class-session-schedule-changes",cancel);
    expect(await post(m.http,"/class-session-schedule-changes",cancel)).toMatchObject({changed:true,duplicate:false,cancelledSessionId:classSessionId,replacementSessionId:null});
    expect(await post(m.http,"/class-session-schedule-changes",cancel)).toMatchObject({changed:true,duplicate:true});
    await denyPost(p.http,"/class-session-openings",{classId,classSessionId});
    const {requestId,startsAt,endsAt,lessonId,agendaRequestId}=replacement;
    const start=Date.parse(startsAt),end=Date.parse(endsAt);
    const meetings=Array.from({length:4},(_,i)=>({requestId:i===0?requestId:randomUUID(),startsAt:new Date(start+i*7*86400000).toISOString(),endsAt:new Date(end+i*7*86400000).toISOString()}));
    const series={classId,cadence:"custom",meetings};
    type SeriesReceipt={sessions:{classSessionId:string;duplicate:boolean}[];created:number};
    const concurrent=await Promise.all([
      post<SeriesReceipt>(b.http,"/class-session-schedules",series),
      post<SeriesReceipt>(b.http,"/class-session-schedules",series),
    ]);
    expect(concurrent.map(r=>r.created).sort((a,b)=>a-b)).toEqual([0,4]);
    const created=concurrent.find(r=>r.created===4)!;
    const concurrentReplay=concurrent.find(r=>r.created===0)!;
    expect(created.sessions).toHaveLength(4);
    expect(concurrentReplay.sessions.map(x=>x.classSessionId)).toEqual(created.sessions.map(x=>x.classSessionId));
    expect(concurrentReplay.sessions.every(x=>x.duplicate)).toBe(true);
    const replay=await post<SeriesReceipt>(b.http,"/class-session-schedules",series);
    expect(replay.created).toBe(0);expect(replay.sessions.map(x=>x.classSessionId)).toEqual(created.sessions.map(x=>x.classSessionId));expect(replay.sessions.every(x=>x.duplicate)).toBe(true);
    const changed={...series,meetings:series.meetings.map((meeting,i)=>i===0?{...meeting,startsAt:new Date(Date.parse(meeting.startsAt)+60000).toISOString(),endsAt:new Date(Date.parse(meeting.endsAt)+60000).toISOString()}:meeting)};
    const conflict=await b.http.post(api+"/class-session-schedules",{headers,data:changed});expect(conflict.status()).toBe(409);
    const next=created.sessions[0]!.classSessionId;expect(next).not.toBe(classSessionId);
    expect(await post(b.http,"/class-session-agenda-revisions",{classId,classSessionId:next,requestId:agendaRequestId,expectedRevisionNo:0,items:[{kind:"watch",referenceId:lessonId}]})).toMatchObject({classSessionId:next});
    for(const session of created.sessions.slice(1)){
      await post(b.http,"/class-session-agenda-revisions",{classId,classSessionId:session.classSessionId,requestId:randomUUID(),expectedRevisionNo:0,items:[{kind:"watch",referenceId:lessonId}]});
    }
    const scheduled=await get<{sessions:{id:string;agendaReady:boolean}[]}>(b.http,"/classes/"+classId+"/workspace?view=teach&tab=sessions");
    for(const session of created.sessions)expect(scheduled.sessions.find(x=>x.id===session.classSessionId)?.agendaReady).toBe(true);
    await denyPost(p.http,"/class-session-openings",{classId,classSessionId:next});
    const rows=await sql`SELECT s.id,s.facilitator_person_id,p.state,p.facilitated_session_id
      FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
      WHERE s.id=ANY(${[classSessionId,next]}::uuid[])`;
    expect(rows).toHaveLength(2);
    expect(rows.find(row=>row.id===classSessionId)).toMatchObject({facilitator_person_id:p.grant.personId,state:"cancelled",facilitated_session_id:null});
    expect(rows.find(row=>row.id===next)).toMatchObject({facilitator_person_id:b.grant.personId,state:"scheduled",facilitated_session_id:null});
    {
      const sessionId=fixture.liveClassSessionId;
      expect(sessionId).not.toBe(classSessionId);
      const [due]=await sql`SELECT s.facilitator_person_id,p.facilitated_session_id,p.state
        FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
        WHERE s.id=${sessionId}::uuid AND s.class_id=${classId}::uuid`;
      expect(due).toMatchObject({facilitator_person_id:p.grant.personId,state:"scheduled",facilitated_session_id:null});
      const opened=await post<{facilitatedSessionId:string;pairingCode:string|null;alreadyStarted:boolean}>(p.http,"/class-session-openings",{classId,classSessionId:sessionId});
      expect(opened.alreadyStarted).toBe(false);
      const roomId=uuid.parse(opened.facilitatedSessionId);
      if(!opened.pairingCode)throw Error("A newly opened scheduled Class Session is required");
      const scope={facilitatedSessionId:roomId};
      const learnerScope={...scope,courseAttemptId};
      expect(await post(l.http,"/classroom-pairings",{courseAttemptId,pairingCode:opened.pairingCode})).toMatchObject({...scope,paired:true});
      const activity={...scope,lessonId,requestId:randomUUID(),prompt:"Synthetic continuity exercise",answerType:"single_choice",choices:["First","Second"]};
      const released=await post<{id:string}>(p.http,"/classroom-activities",activity);
      const response={...learnerScope,activityReleaseId:released.id,clientSubmissionId:randomUUID(),clientInstanceId:randomUUID(),answerChoice:0,answerText:null};
      expect(await post(l.http,"/classroom-responses",response)).toMatchObject({saved:true,duplicate:false,graded:false});
      const assisted={...learnerScope,activityReleaseId:released.id,requestId:randomUUID(),method:"paper",answerChoice:1,answerText:null,evidenceNote:"Synthetic paper answer recorded by facilitator, not an electronic submission"};
      await denyPost(f.http,"/classroom-assisted-activities",assisted);
      expect(await post(p.http,"/classroom-assisted-activities",assisted)).toMatchObject({recorded:true,duplicate:false,facilitatorAttributed:true});
      expect(await post(p.http,"/classroom-assisted-activities",assisted)).toMatchObject({recorded:true,duplicate:true,facilitatorAttributed:true});
      const conflicting=await p.http.post(api+"/classroom-assisted-activities",{headers,data:{...assisted,answerChoice:0}});expect(conflicting.status()).toBe(409);
      const feedbackPath="/me/course-attempts/"+courseAttemptId+"/classroom-feedback";
      const rating={facilitatedSessionId:roomId,questionKey:"clarity",rating:4};
      await denyPost(f.http,feedbackPath,rating);
      expect(await post(l.http,feedbackPath,rating)).toMatchObject({saved:true});
      expect(await post(l.http,feedbackPath,{...rating,rating:5})).toMatchObject({saved:true});
      const feedback=await get<{rooms:{facilitatedSessionId:string;ratings:{clarity?:number}}[]}>(l.http,feedbackPath);
      expect(feedback.rooms.find(r=>r.facilitatedSessionId===roomId)?.ratings.clarity).toBe(5);
      const attendance={...learnerScope,requestId:randomUUID(),status:"present",method:"in_person_roll_call",evidenceNote:"Synthetic QA role-play only, not real attendance"};
      expect(await post(p.http,"/classroom-attestations",attendance)).toMatchObject({saved:true,noDeviceEvidence:false});
      const projector={...scope,lessonId,assetVersionId,requestId:randomUUID(),commandKind:"pause",positionSeconds:15};
      expect(await post(p.http,"/classroom-projector-commands",projector)).toMatchObject({accepted:true,duplicate:false});
      const evidence=async()=> {
        const [row]=await sql`SELECT
          (SELECT count(*)::int FROM public.facilitated_learning_participants WHERE facilitated_session_id=${roomId}::uuid AND course_attempt_id=${courseAttemptId}::uuid AND left_at IS NULL) AS paired,
          (SELECT count(*)::int FROM public.facilitated_room_activity_releases WHERE id=${released.id}::uuid AND released_by_person_id=${p.grant.personId}::uuid) AS original_prompt,
          (SELECT count(*)::int FROM public.facilitated_room_activity_responses WHERE activity_release_id=${released.id}::uuid AND course_attempt_id=${courseAttemptId}::uuid) AS responses,
          (SELECT count(*)::int FROM public.facilitated_room_attendance_assertions WHERE facilitated_session_id=${roomId}::uuid AND request_id=${attendance.requestId}::uuid AND facilitator_person_id=${p.grant.personId}::uuid) AS original_attestation,
          (SELECT count(*)::int FROM public.facilitated_room_control_commands WHERE facilitated_session_id=${roomId}::uuid AND request_id=${projector.requestId}::uuid AND facilitator_person_id=${p.grant.personId}::uuid) AS original_projector,
          (SELECT count(*)::int FROM public.facilitated_room_assisted_activity_evidence WHERE facilitated_session_id=${roomId}::uuid AND request_id=${assisted.requestId}::uuid AND facilitator_person_id=${p.grant.personId}::uuid AND learner_person_id=${l.grant.personId}::uuid) AS assisted,
          (SELECT count(*)::int FROM public.facilitated_room_feedback WHERE facilitated_session_id=${roomId}::uuid AND course_attempt_id=${courseAttemptId}::uuid AND participant_person_id=${l.grant.personId}::uuid AND question_key='clarity' AND rating=5) AS rating`;
        return row;
      };
      const originalEvidence=await evidence();
      expect(originalEvidence).toEqual({paired:1,original_prompt:1,responses:1,original_attestation:1,original_projector:1,assisted:1,rating:1});
      const transfer={classId,classSessionId:sessionId,requestId:randomUUID(),expectedFacilitatorPersonId:p.grant.personId,toPersonId:b.grant.personId,reason:"Synthetic QA live facilitator continuity"};
      await denyPost(b.http,"/classroom-control-transfers",transfer);
      await denyPost(f.http,"/classroom-control-transfers",transfer);
      await denyPost(b.http,"/classroom-pairing-renewals",scope);
      expect(await post(m.http,"/classroom-control-transfers",transfer)).toMatchObject({transferred:true,duplicate:false,facilitatedSessionId:roomId,currentFacilitatorPersonId:b.grant.personId});
      expect(await post(m.http,"/classroom-control-transfers",transfer)).toMatchObject({transferred:true,duplicate:true});
      await denyPost(m.http,"/classroom-control-transfers",{...transfer,requestId:randomUUID()});
      await denyPost(p.http,"/classroom-pairing-renewals",scope);
      await denyPost(p.http,"/class-session-openings",{classId,classSessionId:sessionId});
      expect(await post(b.http,"/class-session-openings",{classId,classSessionId:sessionId})).toMatchObject({alreadyStarted:true,facilitatedSessionId:roomId});
      // No learner re-pairing, replacement enrollment or fabricated evidence.
      expect(await evidence()).toEqual(originalEvidence);
      const visible=await get<{activities:{id:string;responded:boolean}[]}>(l.http,"/classrooms/"+roomId+"/attempts/"+courseAttemptId+"/activities");
      expect(visible.activities.find(x=>x.id===released.id)).toMatchObject({responded:true});
      const hostActivity=await get<{pairedCount:number;releases:{id:string;respondingLearners:number}[]}>(b.http,"/classrooms/"+roomId+"/host-activity");
      expect(hostActivity.pairedCount).toBe(1);
      expect(hostActivity.releases.find(x=>x.id===released.id)).toMatchObject({respondingLearners:1});
      expect(await get(b.http,"/classrooms/"+roomId+"/projector")).toMatchObject({roomState:"live",latest:{commandKind:"pause",positionSeconds:15,lessonId,assetVersionId}});
      await denyPost(p.http,"/classroom-projector-commands",{...projector,requestId:randomUUID()});
      await denyGet(p.http,"/classrooms/"+roomId+"/attendance");
      const roster=await get<{members:{courseAttemptId:string;latestStatus:string;pairedDevice:boolean}[]}>(b.http,"/classrooms/"+roomId+"/attendance");
      expect(roster.members.find(x=>x.courseAttemptId===courseAttemptId)).toMatchObject({latestStatus:"present",pairedDevice:true});
      expect(await post(b.http,"/classroom-activity-closures",{...scope,activityReleaseId:released.id})).toMatchObject({closed:true});
      expect(await post(b.http,"/classroom-projector-commands",{...projector,requestId:randomUUID(),commandKind:"play"})).toMatchObject({accepted:true,duplicate:false});
      const renew={...scope,requestId:randomUUID()};
      const first=await post<{pairingCode:string;pairingExpiresAt:string;duplicate:boolean}>(b.http,"/classroom-pairing-renewals",renew);
      expect(first.duplicate).toBe(false);
      const repeated=await post<typeof first>(b.http,"/classroom-pairing-renewals",renew);
      expect(repeated.duplicate).toBe(true);expect(repeated.pairingCode===first.pairingCode).toBe(true);expect(repeated.pairingExpiresAt===first.pairingExpiresAt).toBe(true);
      const rotated=await post<typeof first>(b.http,"/classroom-pairing-renewals",{...scope,requestId:randomUUID()});
      expect(rotated.pairingCode===first.pairingCode).toBe(false);
      await denyPost(b.http,"/classroom-pairing-renewals",renew);
      const [after]=await sql`SELECT s.facilitator_person_id AS original,r.facilitator_person_id AS controller,p.facilitated_session_id
        FROM public.class_sessions s JOIN public.facilitated_classroom_plans p ON p.id=s.classroom_plan_id
        JOIN public.facilitated_learning_sessions r ON r.id=p.facilitated_session_id WHERE s.id=${sessionId}::uuid`;
      expect(after).toMatchObject({original:p.grant.personId,controller:b.grant.personId,facilitated_session_id:roomId});
      expect(await evidence()).toEqual(originalEvidence);
      expect(await post(b.http,"/classroom-closures",scope)).toMatchObject({ended:true});
    }
    const workspace=await get<{rooms:Record<string,unknown>[]}>(b.http,"/me/facilitated-classroom-workspace");
    for(const room of workspace.rooms){expect(room).not.toHaveProperty("pairingCodeDigest");expect(room).not.toHaveProperty("pairingCode");}
    for(const http of contexts)expect((await http.post(api+"/access/logout",{headers,data:{}})).status()).toBe(204);
  }finally{await Promise.all(contexts.map(c=>c.dispose()));}
});
