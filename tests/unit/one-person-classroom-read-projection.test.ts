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
    expect(ddl).toContain("current_setting('neon.branch_id',true)");
    expect(ddl).not.toMatch(/DROP TABLE\s+|CASCADE\s*;/i);
  });

  it("keeps the staged remaining Person FK cutover behind independent release approval",()=>{
    const ddl=source("database/production/2026-11-17-stage-unified-person-fk-rebind.sql");
    expect(ddl).toContain("can.one_person_runtime_cutover_verified");
    expect(ddl).toContain("can.one_person_fk_rebind_approved");
    expect(ddl).toContain("Native Person FK graph changed");
    expect(ddl).toContain("IF old_count <> 36 THEN");
    expect(ddl).toContain("historical");
  });
  it("keeps guardian identity on the verified CAN Person and verifies child authority separately",()=>{
    const guardian=source("src/modules/classes/native-class-guardian-authority.server.ts");
    expect(guardian).toContain("getIdentityContext(request)");
    expect(guardian).toContain('actor.role!=="guardian"');
    expect(guardian).toContain("account?.personId!==actor.actorPersonId");
    expect(guardian).toContain("return {personId:actor.actorPersonId}");
    expect(guardian).toContain("guardianAuthorities.verifiedAt");
    expect(guardian).toContain("guardianAuthorities.startsAt");
    expect(guardian).toContain("guardianAuthorities.endsAt");
    expect(guardian).toContain("age<0||age>=18");
    expect(guardian).not.toContain("accessAccountCanonicalPrincipals");
  });

  it("preserves staff audit/approver FK semantics while moving actors to public People",()=>{
    const files=[
      "database/production/2026-11-17-rebind-30-actor-person-fks.sql",
      "database/production/2026-11-17-rebind-30-more-actor-person-fks.sql",
      "database/production/2026-11-17-rebind-actor-person-fks-batch-3.sql",
      "database/production/2026-11-17-rebind-final-18-actor-person-fks.sql",
      "database/production/2026-11-17-rebind-67-audit-facilitator-reviewer-person-fks.sql",
    ];
    for(const file of files){
      const ddl=source(file);
      expect(ddl).toContain("REFERENCES public.people(id)");
      expect(ddl).toContain("current_setting('neon.branch_id',true)");
      expect(ddl).toContain("education_v30.persons");
      expect(ddl).not.toMatch(/DROP TABLE\\b|CASCADE\\s*;/i);
    }
    const final=source(files[4]);
    expect(final.toLowerCase()).toContain("learner, guardian");
    expect(final).toContain("ON DELETE");
    const runtime=source("scripts/acceptance/check-main-one-person-runtime.mjs");
    expect(runtime).toContain("critical_shared_actor_fks");
    expect(runtime).toContain("public_people_rls_forced");
  });

  it("rebinds operational and safeguarding Person references without a new identity bridge",()=>{
    const publicDDL=source("database/production/2026-11-17-rebind-22-public-operational-person-fks.sql");
    const secureDDL=source("database/production/2026-11-17-rebind-5-secure-actor-person-fks.sql");
    expect(publicDDL).toContain("REFERENCES public.people(id)");
    expect(publicDDL).toContain("remaining<>3");
    expect(publicDDL).toContain("Operational Person records need review");
    expect(publicDDL).toContain("'guardian_authorities','guardian_authorities_guardian_person_id_fkey'");
    expect(secureDDL).toContain("REFERENCES public.people(id)");
    expect(secureDDL).toContain("relrowsecurity AND relforcerowsecurity");
    expect(secureDDL).toContain("Sensitive records require review");
    expect(secureDDL).not.toMatch(/DROP TABLE\b|CASCADE\s*;/i);
  });

  it("fails the main cutover until second Person writers and native cookie paths retire",()=>{
    const script=source("scripts/acceptance/check-main-one-person-runtime.mjs");
    expect(script).toContain('const PROJECT="sweet-hall-62441909",MAIN="br-restless-sea-ar9ooo55"');
    expect(script).toContain("CAN_MAIN_ONE_PERSON_RUNTIME_CHECK");
    expect(script).toContain("nativeLearnerPersonCreation");
    expect(script).toContain("nativeReviewedLearnerCreation");
    expect(script).toContain("nativeLearnerSessionIssuance");
    expect(script).toContain("dualCookieLearnerContext");
    expect(script).toContain("secondPersonGuardianLink");
    expect(script).toContain("historical_person_differences");
    expect(script).toContain('state:blockers.length?"BLOCKED"');
    expect(script).not.toMatch(/sql`\s*(?:INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|CREATE|GRANT)\b/i);
  });

});
