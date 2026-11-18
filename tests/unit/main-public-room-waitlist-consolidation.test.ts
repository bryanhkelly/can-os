import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

const roomTables=[
  "facilitated_room_activity_releases",
  "facilitated_room_activity_responses",
  "facilitated_room_control_commands",
  "facilitated_room_feedback",
  "facilitated_room_presence_events",
  "facilitated_room_survey_campaigns",
] as const;
const roomMigration="database/production/2026-11-17-consolidate-six-facilitated-room-evidence-tables.sql";
const waitlistMigration="database/production/2026-11-17-consolidate-noncredit-enrollment-waitlist.sql";

describe("Neon main public room evidence and noncredit waitlist cutover",()=>{
  it("keeps direct OID-preserving migrations without parallel schemas or destructive grants",()=>{
    const room=read(roomMigration);
    const waitlist=read(waitlistMigration);
    for(const name of roomTables)expect(room).toContain(`ALTER TABLE education_v30.${name} SET SCHEMA public;`);
    expect(waitlist).toContain("ALTER TABLE education_v30.noncredit_enrollment_waitlist SET SCHEMA public;");
    for(const migration of [room,waitlist]){
      expect(migration).toContain("relforcerowsecurity");
      expect(migration).toContain("pg_constraint");
      expect(migration).toContain("pg_policy");
      expect(migration).not.toMatch(/\\b(?:DROP TABLE|CASCADE|DISABLE ROW LEVEL SECURITY|TRUNCATE|INSERT INTO)\\b/i);
    }
    for(const view of [
      "facilitated_room_pilot_evidence",
      "facilitated_room_pilot_weekly_evidence",
      "facilitated_room_media_command_evidence",
    ])expect(room).toContain(`SELECT * FROM education_v30.${view} LIMIT 0`);
  });

  it("maps room controls, feedback and evidence to public through the shared Drizzle declarations",()=>{
    const evidence=read("src/db/canonical-v301/facilitated-room-evidence.ts");
    const controls=read("src/db/canonical-v301/classroom-projector-controls.ts");
    const feedback=read("src/db/canonical-v301/facilitated-room-feedback.ts");
    for(const name of roomTables.slice(0,2).concat(roomTables.slice(4,6)))
      expect(evidence).toContain(`pgTable("${name}"`);
    expect(controls).toContain('pgTable("facilitated_room_control_commands"');
    expect(feedback).toContain('pgTable("facilitated_room_feedback"');
    for(const name of roomTables)
      expect(evidence+controls+feedback).not.toContain(`educationV30.table("${name}"`);
    const waitlist=read("src/db/canonical-v301/self-enrollment.ts");
    expect(waitlist).toContain('pgTable("noncredit_enrollment_waitlist"');
    expect(waitlist).not.toContain('educationV30.table("noncredit_enrollment_waitlist"');
  });

  it("keeps the read-only acceptance checks aligned with public storage",()=>{
    const room=read("scripts/acceptance/check-classroom-pilot-schema.mjs");
    const fourSessions=read("scripts/acceptance/check-ws4-four-session-journey.mjs");
    const consolidation=read("scripts/acceptance/check-public-schema-consolidation.mjs");
    expect(room).toContain('const publicTables=new Set([');
    for(const table of roomTables)expect(room).toContain('"${table}"'.replace("${table}",table));
    expect(fourSessions).toContain("public.facilitated_room_presence_events");
    expect(fourSessions).not.toContain("education_v30.facilitated_room_presence_events");
    expect(consolidation).toContain(roomMigration);
    expect(consolidation).toContain(waitlistMigration);
    expect(consolidation).toContain("protectedNames.length!==71");
  });
});
