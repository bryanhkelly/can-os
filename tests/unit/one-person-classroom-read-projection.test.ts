import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("one authoritative Person for classroom attendance",()=>{
  it("reads participant names only from the public People entity",()=>{
    const person=source("src/db/canonical-v301/classroom-persons.ts");
    const roster=source("src/modules/learning/classroom-attendance.functions.ts");
    expect(person).toContain('pgTable("people"');
    expect(person).not.toContain('educationV30.table("persons"');
    expect(roster).toContain("registeredRoomParticipant(tx,room,attempt.id,releaseScope)");
    expect(roster).toContain("eligible.map(x=>x.personId)");
    expect(roster).toContain("classroomPersons.legalFirstName");
    expect(roster).toContain("assertNativeClassAttendanceReader");
    expect(roster).not.toContain("accessAccountNoncreditPrincipals");
  });

  it("moves empty Sections and Foundations without changing their seven composite and simple FKs",()=>{
    const ddl=source("database/production/2026-11-17-relocate-course-sections-and-foundations.sql");
    expect(ddl).toContain("ALTER TABLE education_v30.course_sections SET SCHEMA public");
    expect(ddl).toContain("ALTER TABLE education_v30.foundations SET SCHEMA public");
    expect(ddl).toContain("Seven existing inbound foreign keys were not preserved");
    expect(ddl).toContain("WHERE current_setting");
    expect(ddl).not.toMatch(/DROP TABLE\s+|CASCADE\s*;/i);
  });

  it("does not authorize activating the staged 239 Person FK cutover prematurely",()=>{
    const ddl=source("database/production/2026-11-17-stage-unified-person-fk-rebind.sql");
    expect(ddl).toContain("can.one_person_runtime_cutover_verified");
    expect(ddl).toContain("can.one_person_fk_rebind_approved");
    expect(ddl).toContain("Native Person FK graph changed");
    expect(ddl).toContain("historical");
  });
});
