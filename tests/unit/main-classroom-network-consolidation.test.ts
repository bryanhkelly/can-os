import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
const migrations=[
  "database/production/2026-11-17-consolidate-classroom-evidence-tables.sql",
  "database/production/2026-11-17-consolidate-network-reporting-grants.sql",
];

describe("Neon main Classroom Connect and network grant migration",()=>{
  it("uses existing public tables in the three Drizzle models",()=>{
    const rehearsal=read("src/db/canonical-v301/classroom-rehearsal.ts");
    const assisted=read("src/db/canonical-v301/classroom-assisted-activity.ts");
    const network=read("src/db/canonical-v301/network-attribution.ts");
    expect(rehearsal).toContain('facilitatedRehearsalEvents=pgTable("facilitated_rehearsal_events"');
    expect(assisted).toContain('pgTable("facilitated_room_assisted_activity_evidence"');
    expect(network).toContain('networkReportingGrants = pgTable("network_reporting_grants"');
    expect(rehearsal).not.toContain('educationV30.table("facilitated_rehearsal_events"');
    expect(assisted).not.toContain('educationV30.table("facilitated_room_assisted_activity_evidence"');
    expect(network).not.toContain('educationV30.table("network_reporting_grants"');
  });

  it("retains original tables and rejects security regressions before migration",()=>{
    const sql=migrations.map(read).join("\n");
    for(const name of [
      "facilitated_rehearsal_events",
      "facilitated_room_assisted_activity_evidence",
      "network_reporting_grants",
    ]) expect(sql).toContain("ALTER TABLE education_v30."+name+" SET SCHEMA public");
    expect(sql).toContain("relforcerowsecurity");
    expect(sql).toContain("has_table_privilege('authenticated'");
    expect(sql).not.toMatch(/\bDROP\s+TABLE\b|\bDISABLE\s+ROW\s+LEVEL\s+SECURITY\b|\bINSERT\s+INTO\b/i);
  });

  it("keeps Classroom Connect acceptance schema-aware",()=>{
    const schemaCheck=read("scripts/acceptance/check-classroom-pilot-schema.mjs");
    expect(schemaCheck).toContain('const publicTables=new Set([');
    expect(schemaCheck).toContain('inExpectedSchema(row?.schema_name,name)');
    expect(schemaCheck).toContain('WHERE schemaname IN (\'public\',\'education_v30\')');
    const mainCheck=read("scripts/acceptance/check-main-classroom-network-consolidation.mjs");
    expect(mainCheck).toContain("CAN_MAIN_CLASSROOM_NETWORK_CHECK");
    expect(mainCheck).toContain('MAIN="br-restless-sea-ar9ooo55"');
    expect(mainCheck).toContain("directClientTableReadDenied:true");
    expect(mainCheck).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE)\b/i);
  });
});
