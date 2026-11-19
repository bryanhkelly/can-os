#!/usr/bin/env node
/**
 * Read-only evidence gate for two independently authorized four-Session Classes.
 * This checks real persisted delivery, not a mocked UI. Execute against an
 * explicitly selected isolated QA branch after the migration/fixtures/browser
 * journey have been run. It never seeds data or creates attendance.
 *
 * APP_ENV=test NODE_ENV=test CAN_WS00_QA_RUN=1 \\
 * TEST_DATABASE_URL=... DATABASE_URL=... CAN_E2E_TEST_BRANCH_ID=br-... \\
 * CAN_WS00_QA_FOUR_SESSION_CLASS_A_ID=... \\
 * CAN_WS00_QA_FOUR_SESSION_CLASS_B_ID=... \\
 * node scripts/acceptance/check-ws4-four-session-journey.mjs
 */
import assert from "node:assert/strict";
import {neon} from "@neondatabase/serverless";
import {verifyAdmissionsNeonBranch} from "../verify-admissions-neon-branch.mjs";
const env=process.env;
const required=(name)=>{if(!env[name])throw Error("Missing "+name);return env[name]};
const asCount=(x)=>Number(x??0);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function main(){
  assert.equal(env.APP_ENV,"test","isolated test APP_ENV required");
  assert.equal(env.NODE_ENV,"test","isolated test NODE_ENV required");
  assert.equal(required("CAN_WS00_QA_RUN"),"1","explicit QA invocation required");
  const url=required("TEST_DATABASE_URL");
  assert.equal(url,env.DATABASE_URL,"application must target isolated QA database");
  const branch=required("CAN_E2E_TEST_BRANCH_ID");
  await verifyAdmissionsNeonBranch({...env,CAN_ADMISSIONS_TEST_BRANCH_ID:branch});
  const classIds=[
    required("CAN_WS00_QA_FOUR_SESSION_CLASS_A_ID"),
    required("CAN_WS00_QA_FOUR_SESSION_CLASS_B_ID"),
  ];
  assert(classIds.every(id=>uuid.test(id))&&classIds[0]!==classIds[1],
    "two distinct valid Class IDs required");
  const sql=neon(url);
  const [schema]=await sql`
    SELECT to_regclass('public.class_session_agenda_revisions') IS NOT NULL AS agendas,
      to_regclass('public.class_completion_policy_versions') IS NOT NULL AS completion_policies,
      to_regclass('public.facilitated_room_attendance_assertions') IS NOT NULL AS attendance,
      to_regclass('public.facilitated_learning_playback') IS NOT NULL AS playback
  `;
  assert(schema&&Object.values(schema).every(Boolean),
    "required WS3/WS4 schema missing; run approved QA migrations first");
  const sessions=await sql`
    SELECT cs.class_id::text AS class_id, cs.id::text AS class_session_id,
      cs.facilitator_person_id::text AS assigned_facilitator,
      p.facilitator_person_id::text AS plan_facilitator,
      p.site_id::text AS site_id,p.state AS plan_state,
      p.facilitated_session_id::text AS room_id,
      d.starts_at AS starts_at,d.ends_at AS ends_at,
      (SELECT count(*)::int FROM public.class_session_agenda_revisions a
       WHERE a.class_session_id=cs.id) AS agenda_revisions,
      (SELECT count(*)::int FROM public.facilitated_learning_playback v
       WHERE v.facilitated_session_id=p.facilitated_session_id AND v.kind='played') AS playback_events,
      (SELECT count(*)::int FROM public.facilitated_room_attendance_assertions a
       WHERE a.facilitated_session_id=p.facilitated_session_id AND a.status='present'
         AND a.facilitator_person_id=cs.facilitator_person_id) AS attestations,
      (SELECT count(*)::int FROM public.facilitated_room_presence_events v
       WHERE v.facilitated_session_id=p.facilitated_session_id AND v.event_kind='joined') AS joins,
      (SELECT count(*)::int FROM public.facilitated_room_presence_events v
       WHERE v.facilitated_session_id=p.facilitated_session_id
         AND v.event_kind='heartbeat') AS heartbeats,
      (SELECT count(*)::int FROM public.facilitated_learning_participants v
       WHERE v.facilitated_session_id=p.facilitated_session_id
         AND v.last_paired_at>v.joined_at) AS paired_again
    FROM public.class_sessions cs
    JOIN public.classes c ON c.id=cs.class_id
    JOIN public.facilitated_classroom_plans p
      ON p.id=cs.classroom_plan_id AND p.delivery_session_id=cs.delivery_session_id
    JOIN public.delivery_sessions d ON d.id=cs.delivery_session_id
    WHERE cs.class_id IN (${classIds[0]}::uuid,${classIds[1]}::uuid)
    ORDER BY cs.class_id,d.starts_at
  `;
  const failures=[];
  const sites=new Set();
  for(const id of classIds){
    const rows=sessions.filter(row=>row.class_id===id);
    if(rows.length!==4)failures.push(id+": expected exactly four dated Sessions, got "+rows.length);
    const dates=new Set(rows.map(row=>new Date(row.starts_at).toISOString()));
    if(dates.size!==rows.length)failures.push(id+": duplicate Session dates");
    for(const [index,row] of rows.entries()){
      sites.add(row.site_id);
      const which=id+" session "+(index+1);
      if(row.assigned_facilitator!==row.plan_facilitator)failures.push(which+": facilitator mismatch");
      if(new Date(row.ends_at)<=new Date(row.starts_at))failures.push(which+": invalid date window");
      if(asCount(row.agenda_revisions)<1)failures.push(which+": missing published agenda");
      if(row.plan_state!=="started"||!row.room_id)failures.push(which+": room not started");
      if(asCount(row.playback_events)<1)failures.push(which+": no actual playback event");
      if(asCount(row.attestations)<1)failures.push(which+": no facilitator-attested attendance");
      if(asCount(row.joins)<1||asCount(row.heartbeats)<1)
        failures.push(which+": no observed learner join and heartbeat");
    }
  }
  if(sites.size!==2||sites.has(null))failures.push("classes must belong to two independent Sites");
  // At least one real persistence-level re-pair is required; mere heartbeats
  // are insufficient to claim a learner reconnected after disruption.
  if(!sessions.some(s=>asCount(s.paired_again)>0))
    failures.push("no learner re-paired to a live room");
  const result={
    gate:"WS4 four dated Sessions, agendas, playback, attendance, reconnect",
    passed:failures.length===0,branchId:branch,
    sessionsChecked:sessions.length,sitesVerified:sites.size,
    playbackRows:sessions.reduce((n,x)=>n+asCount(x.playback_events),0),
    facilitatorAttestations:sessions.reduce((n,x)=>n+asCount(x.attestations),0),
    learnerReconnections:sessions.reduce((n,x)=>n+asCount(x.paired_again),0),
    failures,
    note:"Browser flows, wrong-Person negative tests, publishing rights and restricted-role RLS require separate E2E evidence.",
  };
  console.log(JSON.stringify(result,null,2));
  if(failures.length)process.exitCode=1;
}
main().catch(e=>{console.error("WS4 four-Session NO-GO: "+(e instanceof Error?e.message:String(e)));process.exitCode=1;});
