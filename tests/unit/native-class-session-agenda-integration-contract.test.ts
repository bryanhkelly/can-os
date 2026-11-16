import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
import { assertNativeClassSessionSeries } from "@/domain/native-class-sessions";
import { assertClassSessionAgendaReferences } from "@/domain/native-class-session-agenda";
const read=(file:string)=>readFileSync(file,"utf8");
const id=(digit:string)=>digit.repeat(8)+"-"+digit.repeat(4)+"-4"+digit.repeat(3)+"-8"+digit.repeat(3)+"-"+digit.repeat(12);

describe("WS4 four-week, two-Site contract (synthetic unit model, NOT browser acceptance)",()=>{
  it("keeps two independent four-week Classes on the canonical Session timetable",()=>{
    const siteA={id:id("1"),classId:id("2"),courseVersionId:id("3"),lessonId:id("4")};
    const siteB={id:id("5"),classId:id("6"),courseVersionId:id("7"),lessonId:id("8")};
    for(const site of [siteA,siteB]){
      const dates=Array.from({length:4},(_,week)=>{
        const start=new Date("2027-03-01T18:00:00Z");
        start.setUTCDate(start.getUTCDate()+week*7);
        return {requestId:id(String(week+1)),startsAt:start.toISOString(),
          endsAt:new Date(start.getTime()+60*60000).toISOString()};
      });
      expect(()=>assertNativeClassSessionSeries(dates,"weekly")).not.toThrow();
      expect(()=>assertClassSessionAgendaReferences([
        {kind:"study",referenceId:site.lessonId},
        {kind:"watch",referenceId:site.lessonId},
        {kind:"practice",referenceId:site.lessonId},
      ],{lessons:new Set([site.lessonId]),assignments:new Set(),assessments:new Set()})).not.toThrow();
    }
    expect(()=>assertClassSessionAgendaReferences([{kind:"watch",referenceId:siteA.lessonId}],{
      lessons:new Set([siteB.lessonId]),assignments:new Set(),assessments:new Set(),
    })).toThrow();
    expect(siteA.id).not.toEqual(siteB.id);
    expect(siteA.classId).not.toEqual(siteB.classId);
  });
  it("rechecks Class, exact facilitator and the authorization boundary server-side",()=>{
    const api=read("src/modules/classes/native-class-session-agenda.functions.ts");
    const schedule=read("src/modules/classes/native-class-sessions.functions.ts");
    for(const claim of [
      "requireNativeClassSessionHost(tx,host,data.classId",
      "assertCurrentNativeClassFacilitatorSession(tx,host.actor)",
      "link.facilitatorPersonId!==host.actor.actorPersonId",
      "assertClassSessionAgendaReferences",
      "authorizeCanonicalCourseAttempt(",
      "authorized.source!==\"class\"",
      'eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId!)',
      'eq(classSessionAgendaRevisions.classSessionId,link.id)',
      "CAN_WS4_SESSION_AGENDAS_ENABLED",
    ])expect(api).toContain(claim);
    expect(schedule).toContain("publish a Course-linked Class Session study plan before opening");
    expect(schedule).toContain("revokeNativeClassSession");
  });
  it("orders existing authorized media without granting playback or activity evidence",()=>{
    const controls=read("src/components/learning/ClassroomPlaybackControls.tsx");
    const presenter=read("src/components/learning/NativeClassroomHostPanel.tsx");
    expect(controls).toContain("getFacilitatedRoomMedia");
    expect(controls).toContain("issueClassroomProjectorCommand");
    expect(controls).toContain("preferredLessonIds");
    expect(presenter).toContain("getNativeClassSessionAgenda");
    expect(presenter).toContain("ClassroomAttendancePanel");
    const api=read("src/modules/classes/native-class-session-agenda.functions.ts");
    for(const prohibited of [
      "tx.insert(canonicalClassEnrollments)",
      "tx.insert(learnerLessonProgress)",
      "tx.insert(canonicalClassOutcomes)",
      "tx.insert(canonicalClassAwards)",
      "tx.insert(facilitatedLearningPlayback)",
    ])expect(api).not.toContain(prohibited);
  });
  it("retains historical Session revisions and denies unscoped direct table access",()=>{
    const migration=read("database/canonical/v3.0.1/patch-class-session-agendas-ws4.sql");
    expect(migration).toContain("Class Session agenda history is immutable");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE ALL ON education_v30.class_session_agenda_revisions FROM PUBLIC");
    expect(migration).toContain("bound.facilitator_person_id<>NEW.created_by_person_id");
    expect(migration).toContain("bound.course_version_id<>NEW.course_version_id");
    expect(migration).toContain("bound.state<>'scheduled'");
    expect(migration).toContain("bound.starts_at<=now()");
    expect(migration).toContain("revision_no<>previous_no+1");
  });
});
