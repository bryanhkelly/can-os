#!/usr/bin/env node
/**
 * Read-only, branch-explicit schema gate for Classroom Connect pilot evidence.
 * Requires CAN_CLASSROOM_SCHEMA_VALIDATION=1 and DATABASE_URL set to a QA branch.
 * This script does not create, modify, or delete database rows.
 */
import assert from "node:assert/strict";
import { Pool } from "@neondatabase/serverless";

if(process.env.CAN_CLASSROOM_SCHEMA_VALIDATION!=="1")
  throw new Error("Explicit CAN_CLASSROOM_SCHEMA_VALIDATION=1 is required.");
if(!process.env.DATABASE_URL)throw new Error("Select an explicit QA DATABASE_URL.");
const pool=new Pool({connectionString:process.env.DATABASE_URL});
const tables=[
  "facilitated_room_activity_releases","facilitated_room_activity_responses",
  "facilitated_room_presence_events","facilitated_room_attendance_assertions",
  "facilitated_room_feedback","facilitated_room_survey_campaigns",
  "facilitated_rehearsal_events","facilitated_room_control_commands",
];
const views=[
  "facilitated_room_pilot_evidence","facilitated_room_pilot_weekly_evidence",
  "facilitated_room_media_command_evidence",
];
const expectedColumns=[
  "facilitated_room_activity_releases.facilitated_session_id",
  "facilitated_room_activity_releases.released_by_person_id",
  "facilitated_room_activity_releases.request_id",
  "facilitated_room_activity_responses.course_attempt_id",
  "facilitated_room_activity_responses.client_submission_id",
  "facilitated_room_presence_events.client_instance_id",
  "facilitated_room_presence_events.received_at",
  "facilitated_room_attendance_assertions.method",
  "facilitated_room_attendance_assertions.asserted_at",
  "facilitated_room_feedback.question_key",
  "facilitated_room_survey_campaigns.survey_campaign_id",
  "facilitated_rehearsal_events.request_id",
  "facilitated_room_control_commands.command_kind",
  "facilitated_room_control_commands.position_seconds",
];
try{
  const [objects,columns,policies,indexes]=await Promise.all([
    pool.query(`
      SELECT c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.reloptions,
      EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
        WHERE a.grantee=0) AS grants_public
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='education_v30' AND c.relname=ANY($1::text[])
    `,[[...tables,...views]]),
    pool.query(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='education_v30' AND table_name=ANY($1::text[])
    `,[tables]),
    pool.query(`
      SELECT tablename,policyname,roles FROM pg_policies
      WHERE schemaname='education_v30' AND tablename=ANY($1::text[])
    `,[tables]),
    pool.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname='education_v30'
      AND indexname IN (
        'facilitated_room_controls_recent_idx','facilitated_room_release_session_time_idx',
        'facilitated_room_responses_room_idx','facilitated_room_presence_room_recent_idx',
        'facilitated_room_attendance_latest_idx','facilitated_rehearsal_events_site_idx'
      )
    `),
  ]);
  const names=new Map(objects.rows.map(r=>[r.relname,r]));
  assert.equal(objects.rows.length,tables.length+views.length,"Missing pilot evidence relation or view");
  for(const name of tables){
    const row=names.get(name);
    assert(row?.relkind==="r"&&row?.relrowsecurity===true&&row?.relforcerowsecurity===true,
      `Forced row security missing: ${name}`);
    assert(row.grants_public===false,`Public table access forbidden: ${name}`);
    const own=policies.rows.filter(p=>p.tablename===name);
    assert.equal(own.length,1,`Exactly one isolated policy expected for ${name}`);
    assert.deepEqual(own[0].roles,["neondb_owner"],`Unexpected policy role for ${name}`);
  }
  for(const name of views){
    const row=names.get(name);
    assert(row?.relkind==="v"&&row.reloptions?.includes("security_invoker=true"),
      `Invoking-principal view required: ${name}`);
    assert(row.grants_public===false,`Public report view forbidden: ${name}`);
  }
  const have=new Set(columns.rows.map(r=>r.table_name+"."+r.column_name));
  for(const name of expectedColumns)assert(have.has(name),`Missing evidence column ${name}`);
  assert.equal(indexes.rows.length,6,"Expected room evidence lookup indexes");
  console.log("Classroom pilot evidence tables, RLS, private views and indexes verified.");
}finally{await pool.end();}
