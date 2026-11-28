import {test,expect} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {NestQaClient,actorSchema,uuid} from "../helpers/nest-qa-client";
const meeting=z.object({requestId:uuid,agendaRequestId:uuid,startsAt:z.string().datetime({offset:true}),endsAt:z.string().datetime({offset:true}),lessonId:uuid,assetVersionId:uuid,prompt:z.string().min(5).max(1000),choices:z.array(z.string().min(1).max(200)).min(2).max(8)}).strict();
const site=z.object({host:actorSchema,siteId:uuid,classId:uuid,meetings:z.array(meeting).length(4)}).strict();
const participant=z.object({actor:actorSchema,courseAttemptId:uuid,paired:z.boolean(),present:z.boolean()}).strict();
const schedule=z.object({stage:z.literal("schedule"),sites:z.array(site).length(2)}).strict();
const deliver=z.object({stage:z.literal("deliver"),host:actorSchema,siteId:uuid,classId:uuid,classSessionId:uuid,meeting,participants:z.array(participant).min(2).max(20),foreign:participant}).strict();
const f=z.discriminatedUnion("stage",[schedule,deliver]).superRefine((f,ctx)=>{
 const bad=()=>ctx.addIssue({code:z.ZodIssueCode.custom,message:"Reviewed two-Site schedule or exact due session with distinct cohort actors required"});
 if(f.stage==="schedule"){
  if(new Set(f.sites.map(s=>s.siteId)).size!==2||new Set(f.sites.map(s=>s.classId)).size!==2||new Set(f.sites.map(s=>s.host.organizationId)).size!==2)bad();
  const meetings=f.sites.flatMap(s=>s.meetings);
  for(const key of ["requestId","agendaRequestId"] as const)if(new Set(meetings.map(m=>m[key])).size!==8)bad();
  for(const s of f.sites){
   if(!s.host.organizationId||s.host.siteId!==s.siteId)bad();
   for(const [i,m] of s.meetings.entries()){
    const start=Date.parse(m.startsAt),end=Date.parse(m.endsAt);
    if(start<=Date.now()||end-start<15*60000||end-start>8*3600000||i>0&&start<Date.parse(s.meetings[i-1]!.endsAt))bad();
   }
  }
 }else{
  if(!f.host.organizationId||f.host.siteId!==f.siteId||f.foreign.actor.organizationId===f.host.organizationId||!f.participants.some(p=>p.paired)||!f.participants.some(p=>!p.paired)||!f.participants.some(p=>!p.present)||!f.participants.some(p=>p.present))bad();
  const actors=[f.host,...f.participants.map(p=>p.actor),f.foreign.actor];
  for(const key of ["personId","email","grantId"] as const)if(new Set(actors.map(a=>a[key])).size!==actors.length)bad();
  const attempts=[...f.participants,f.foreign].map(p=>p.courseAttemptId);if(new Set(attempts).size!==attempts.length)bad();
  if(Date.now()<Date.parse(f.meeting.startsAt)||Date.now()>=Date.parse(f.meeting.endsAt))bad();
 }
}).parse(JSON.parse(process.env.CAN_NEST_PILOT2_QA_JSON||"null"));
test("facilitated pilot: ordinary Nest scheduling or one due Class Session",async({},info)=>{
 const clients:NestQaClient[]=[];
 async function open(actor:z.infer<typeof actorSchema>){const c=await NestQaClient.create();clients.push(c);await c.login(actor);return c;}
 try{
  const sql=neon(process.env.TEST_DATABASE_URL!);
  const [dbIdentity]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
  expect(dbIdentity).toEqual({project:"sweet-hall-62441909",branch:"br-solitary-art-arun91gj"});
  if(f.stage==="schedule"){
   const hosts=await Promise.all(f.sites.map(s=>open(s.host)));
   const evidence=[];
   for(const [i,s] of f.sites.entries()){
    const host=hosts[i]!;
    const input={classId:s.classId,cadence:"custom",meetings:s.meetings.map(({requestId,startsAt,endsAt})=>({requestId,startsAt,endsAt}))};
    await hosts[1-i]!.deny("POST","/class-session-schedules",input);
    const first=await host.post<{created:number;sessions:{classSessionId:string;duplicate:boolean}[]}>("/class-session-schedules",input);
    expect(first.created).toBe(4);expect(first.sessions).toHaveLength(4);
    const repeat=await host.post<typeof first>("/class-session-schedules",input);
    expect(repeat.created).toBe(0);expect(repeat.sessions.map(s=>s.classSessionId)).toEqual(first.sessions.map(s=>s.classSessionId));
    expect(repeat.sessions.every(s=>s.duplicate)).toBe(true);
    for(const [j,r] of first.sessions.entries()){
     const m=s.meetings[j]!;const agenda={classId:s.classId,classSessionId:r.classSessionId,requestId:m.agendaRequestId,expectedRevisionNo:0,items:[{kind:"watch",referenceId:m.lessonId}]};
     expect(await host.post("/class-session-agenda-revisions",agenda)).toMatchObject({classSessionId:r.classSessionId,revisionNo:1});
     const path="/classes/"+s.classId+"/sessions/"+r.classSessionId+"/agenda";
     expect(await host.get(path)).toMatchObject({revisionNo:1,items:[{kind:"watch",referenceId:m.lessonId}]});
     await hosts[1-i]!.deny("GET",path);
    }
    const [counts]=await sql`SELECT count(*)::int AS count FROM public.class_sessions
      WHERE class_id=${s.classId}::uuid AND request_id=ANY(${input.meetings.map(m=>m.requestId)}::uuid[])`;
    expect(counts?.count).toBe(4);
    evidence.push({siteId:s.siteId,classId:s.classId,sessions:first.sessions.map((r,j)=>({classSessionId:r.classSessionId,requestId:s.meetings[j]!.requestId}))});
   }
   await info.attach("schedule-receipts",{body:JSON.stringify({revision:process.env.CAN_RELEASE_SOURCE_SHA,sites:evidence,deliveryVerified:false}),contentType:"application/json"});
  }else{
   const host=await open(f.host),outside=await open(f.foreign.actor);
   const paired=new Map<string,NestQaClient>();
   for(const p of f.participants.filter(p=>p.paired))paired.set(p.courseAttemptId,await open(p.actor));
   const [scheduled]=await sql`SELECT count(*)::int AS count FROM public.class_sessions
     WHERE id=${f.classSessionId}::uuid AND class_id=${f.classId}::uuid AND request_id=${f.meeting.requestId}::uuid`;
   expect(scheduled?.count).toBe(1);
   const target={classId:f.classId,classSessionId:f.classSessionId};
   await outside.deny("POST","/class-session-openings",target);
   const room=await host.post<{facilitatedSessionId:string;pairingCode:string|null;alreadyStarted:boolean}>("/class-session-openings",target);
   expect(room.alreadyStarted).toBe(false);
   if(!room.pairingCode)throw Error("Fresh due session required");
   const scope={facilitatedSessionId:room.facilitatedSessionId},path="/classrooms/"+room.facilitatedSessionId;
   try{
    expect(await host.post("/class-session-openings",target)).toMatchObject({...scope,alreadyStarted:true,pairingCode:null});
    const renewed=await host.post<{pairingCode:string}>("/classroom-pairing-renewals",scope);
    expect(renewed.pairingCode!==room.pairingCode).toBe(true);
    await outside.deny("POST","/classroom-pairings",{courseAttemptId:f.foreign.courseAttemptId,pairingCode:renewed.pairingCode});
    for(const [courseAttemptId,client] of paired){
     await client.deny("POST","/classroom-pairings",{courseAttemptId,pairingCode:room.pairingCode});
     expect(await client.post("/classroom-pairings",{courseAttemptId,pairingCode:renewed.pairingCode})).toMatchObject({paired:true});
     const presence={...scope,courseAttemptId,clientInstanceId:randomUUID(),clientEventId:randomUUID(),eventKind:"heartbeat"};
     const events=await Promise.all([client.post<{recorded:boolean;duplicate:boolean}>("/classroom-presence-events",presence),client.post<{recorded:boolean;duplicate:boolean}>("/classroom-presence-events",presence)]);
     expect(events.every(e=>e.recorded)).toBe(true);expect(events.filter(e=>e.duplicate)).toHaveLength(1);
    }
    const {lessonId,assetVersionId,prompt,choices}=f.meeting;
    const media=await host.get<{media:{lessonId:string;assetVersionId:string}[]}>(path+"/media");
    expect(media.media.some(m=>m.lessonId===lessonId&&m.assetVersionId===assetVersionId)).toBe(true);
    await outside.deny("POST","/classroom-media-access",{...scope,lessonId,assetVersionId});
    const access=await host.post<{downloadUrl:string;expiresInSeconds:number}>("/classroom-media-access",{...scope,lessonId,assetVersionId});
    expect(access.downloadUrl.startsWith("https://")).toBe(true);
    // Projector commands are intent, not playback evidence. Never fabricate playback.
    for(const commandKind of ["load","play","pause","stop"]){
     const command={...scope,lessonId,assetVersionId,requestId:randomUUID(),commandKind,positionSeconds:0};
     await outside.deny("POST","/classroom-projector-commands",command);
     expect(await host.post("/classroom-projector-commands",command)).toMatchObject({accepted:true,duplicate:false});
     expect(await host.post("/classroom-projector-commands",command)).toMatchObject({accepted:true,duplicate:true});
     expect(await host.get(path+"/projector")).toMatchObject({roomState:"live",latest:{commandKind,lessonId,assetVersionId}});
    }
    const activity={...scope,lessonId,requestId:randomUUID(),prompt,answerType:"single_choice",choices};
    const released=await host.post<{id:string;duplicate:boolean}>("/classroom-activities",activity);
    expect(released.duplicate).toBe(false);expect(await host.post("/classroom-activities",activity)).toMatchObject({id:released.id,duplicate:true});
    for(const [courseAttemptId,client] of paired){
     const activityPath=path+"/attempts/"+courseAttemptId+"/activities";
     const visible=await client.get<{activities:{id:string;responded:boolean}[]}>(activityPath);
     expect(visible.activities.find(a=>a.id===released.id)).toMatchObject({responded:false});
     const answer={...scope,courseAttemptId,activityReleaseId:released.id,clientSubmissionId:randomUUID(),clientInstanceId:randomUUID(),answerChoice:0,answerText:null};
     await outside.deny("POST","/classroom-responses",answer);
     expect(await client.post("/classroom-responses",answer)).toMatchObject({saved:true,duplicate:false,graded:false});
     expect(await client.post("/classroom-responses",answer)).toMatchObject({saved:true,duplicate:true,graded:false});
    }
    const close={...scope,activityReleaseId:released.id};
    expect(await host.post("/classroom-activity-closures",close)).toMatchObject({closed:true,duplicate:false});
    expect(await host.post("/classroom-activity-closures",close)).toMatchObject({closed:true,duplicate:true});
    await outside.deny("GET",path+"/attendance");
    type Roster={members:{courseAttemptId:string;pairedDevice:boolean;latestStatus:string}[]};
    const before=await host.get<Roster>(path+"/attendance");
    for(const p of f.participants){
     expect(before.members.find(m=>m.courseAttemptId===p.courseAttemptId)).toMatchObject({pairedDevice:p.paired,latestStatus:"unknown"});
     const att={...scope,courseAttemptId:p.courseAttemptId,requestId:randomUUID(),status:"present",method:"in_person_roll_call",evidenceNote:"Synthetic QA role-play, not real attendance"};
     expect(await host.post("/classroom-attestations",att)).toMatchObject({saved:true,duplicate:false,noDeviceEvidence:!p.paired});
     expect(await host.post("/classroom-attestations",att)).toMatchObject({saved:true,duplicate:true});
     if(!p.present)expect(await host.post("/classroom-attestations",{...att,requestId:randomUUID(),status:"absent",evidenceNote:"Synthetic QA correction"})).toMatchObject({saved:true});
    }
    const after=await host.get<Roster>(path+"/attendance");
    for(const p of f.participants)expect(after.members.find(m=>m.courseAttemptId===p.courseAttemptId)?.latestStatus).toBe(p.present?"present":"absent");
    const [attestations]=await sql`SELECT count(*)::int AS assertions,
       count(DISTINCT course_attempt_id)::int AS learners FROM public.facilitated_room_attendance_assertions
       WHERE facilitated_session_id=${scope.facilitatedSessionId}::uuid`;
    expect(attestations).toEqual({assertions:f.participants.length+f.participants.filter(p=>!p.present).length,learners:f.participants.length});
    const [responses]=await sql`SELECT count(*)::int AS responses,count(DISTINCT course_attempt_id)::int AS attempts
       FROM public.facilitated_room_activity_responses WHERE activity_release_id=${released.id}::uuid
       AND facilitated_session_id=${scope.facilitatedSessionId}::uuid`;
    expect(responses).toEqual({responses:paired.size,attempts:paired.size});
    const [presence]=await sql`SELECT count(*)::int AS events,count(DISTINCT course_attempt_id)::int AS attempts
       FROM public.facilitated_room_presence_events WHERE facilitated_session_id=${scope.facilitatedSessionId}::uuid AND event_kind='heartbeat'`;
    expect(presence).toEqual({events:paired.size,attempts:paired.size});
   }finally{
    expect(await host.post("/classroom-closures",scope)).toMatchObject({ended:true});
    expect(await host.post("/classroom-closures",scope)).toMatchObject({ended:true,alreadyEnded:true});
   }
   await host.deny("POST","/class-session-openings",target);
   await info.attach("session-receipt",{body:JSON.stringify({revision:process.env.CAN_RELEASE_SOURCE_SHA,classId:f.classId,siteId:f.siteId,classSessionId:f.classSessionId,requestId:f.meeting.requestId,roomClosed:true,participants:f.participants.length,paired:paired.size,corrected:f.participants.filter(p=>!p.present).length,playbackVerified:false}),contentType:"application/json"});
  }
  for(const c of clients)await c.logout();
 }finally{await Promise.all(clients.map(c=>c.close()));}
});
