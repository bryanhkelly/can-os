import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function file(path:string){return readFileSync(new URL("../../"+path,import.meta.url),"utf8");}
describe("Classroom Connect evidence and authority source contracts",()=>{
  it("binds school pairing to current Site placement, never a Site-level role alone",()=>{
    const source=file("src/modules/learning/facilitated-learning.functions.ts");
    expect(source).toContain("authorizeCanonicalCourseAttempt(tx,actor,data.courseAttemptId)");
    expect(source).toContain("classroomEnrollmentSitePlacements");
    expect(source).toContain("eq(classroomDeploymentSites.siteId,room.siteId)");
    expect(source).toContain("if(!sitePlacement)return null");
  });
  it("preserves distinct projector commands, observed playback and rehearsal evidence",()=>{
    const api=file("src/modules/learning/classroom-projector.functions.ts");
    const rehearsal=file("src/modules/learning/classroom-rehearsal.functions.ts");
    const sql=file("scripts/sql/canonical-v301/classroom-projector-controls.sql");
    expect(api).toContain("facilitatedRoomControlCommands");
    expect(api).toContain("assertFacilitatedInstructionalDelivery");
    expect(api).not.toContain("recordFacilitatedPlayback");
    expect(rehearsal).toContain("assertFacilitatedInstructionalPreview");
    expect(rehearsal).toContain("facilitatedRehearsalEvents");
    expect(sql).toContain("WITH (security_invoker=true)");
  });
  it("authorizes answer writes independently of pairing and guards duplicates",()=>{
    const source=file("src/modules/learning/classroom-evidence.functions.ts");
    expect(source).toContain("await authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId)");
    expect(source).toContain("eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId)");
    expect(source).toContain("Conflicting learner response retry");
    expect(source).toContain("Conflicting attendance assertion retry");
    expect(source).toContain("Conflicting classroom presence retry");
    expect(source).not.toContain('status:"completed"');
  });
  it("keeps learner content out of the projector and records non-authoritative attendance",()=>{
    const host=file("src/components/learning/ClassroomFacilitatorConsole.tsx");
    const projector=file("src/routes/classroom.$sessionId.presentation.tsx");
    const companion=file("src/components/learning/ClassroomCompanionRoom.tsx");
    expect(host).toContain("attestClassroomAttendance");
    expect(projector).not.toContain("getClassroomLearnerActivities");
    expect(projector).not.toContain("getLearnerFacilitatedRoom");
    expect(companion).toContain("recordClassroomPresence");
    expect(companion).toContain("submitClassroomResponse");
  });
});
