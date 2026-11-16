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
  it("hides disabled agenda UI and gives Site managers read-only access",()=>{
    const workspace=read("src/modules/classes/native-class-workspace.functions.ts");
    const panel=read("src/components/learning/NativeClassSessionsPanel.tsx");
    const agenda=read("src/modules/classes/native-class-session-agenda.functions.ts");
    expect(workspace).toContain('sessionAgendasEnabled:process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED==="true"');
    expect(workspace).toContain('process.env.CAN_WS4_SESSION_AGENDAS_ENABLED==="true"');
    expect(panel).toContain("workspace.sessionAgendasEnabled&&");
    const host=read("src/components/learning/NativeClassroomHostPanel.tsx");
    expect(host).toContain("enabled:agendasEnabled");
    expect(panel).toContain("agendasEnabled={workspace.sessionAgendasEnabled}");
    expect(workspace).toContain("agendaReady:plansReady.has(row.id)");
    expect(workspace).toContain("agendaRequired:requiresClassSessionAgenda({");
    expect(workspace).toContain("const planRows=sessionAgendasEnabled&&scheduleRows.length?");
    expect(panel).toContain("Study plan required before opening");
    expect(panel).toContain("onPublished={onChanged}");
    const planner=read("src/components/learning/NativeClassSessionAgenda.tsx");
    expect(planner).toContain('view!=="manage"');
    expect(planner).toContain('view==="learn"');
    expect(planner).toContain('tab:"assignments"');
    expect(agenda).toContain('actor.capabilities.has("class.manage")');
    expect(agenda).toContain("await validateClassAuthority(tx");
    expect(agenda).toContain('actor.capabilities.has("learning.room.facilitate")');
    expect(agenda).toContain("link.facilitatorPersonId===actor.actorPersonId");
  });
  it("requires optimistic plan revision and gradual activation",()=>{
    const api=read("src/modules/classes/native-class-session-agenda.functions.ts");
    const agenda=read("src/components/learning/NativeClassSessionAgenda.tsx");
    const schedule=read("src/modules/classes/native-class-sessions.functions.ts");
    expect(api).toContain("data.expectedRevisionNo,previous?.revisionNo??0");
    expect(api).toContain("assertClassSessionAgendaExpectedRevision(");
    expect(agenda).toContain("expectedRevisionNo:data.revisionNo");
    expect(agenda).toContain("Reload latest plan");
    expect(schedule).toContain("requiresClassSessionAgenda({");
    expect(schedule).toContain("CAN_WS4_AGENDA_REQUIRED_FROM");
    expect(schedule).toContain("sessionCreatedAt:link.createdAt");
  });
  it("changes only unopened Sessions and links an audited replacement atomically",()=>{
    const schedule=read("src/modules/classes/native-class-sessions.functions.ts");
    const panel=read("src/components/learning/NativeClassSessionsPanel.tsx");
    const source=read("database/canonical/v3.0.1/patch-unified-class-offerings.sql");
    expect(schedule).toContain("changeNativeClassSessionSchedule=createServerFn");
    expect(schedule).toContain("canChangeUnopenedClassSession({");
    expect(schedule).toContain("scheduledStartsAt:delivery.startsAt,now,");
    expect(schedule).toContain("const booked=await scheduleOneClassroom");
    expect(schedule).toContain("tx.insert(canonicalClassSessions)");
    expect(schedule).toContain('state:"cancelled",updatedAt:now');
    expect(schedule).toContain('eventType:"ClassSessionScheduleChanged"');
    expect(schedule).toContain('eq(domainEvents.aggregateId,original.id)');
    expect(schedule).toContain('eq(domainEvents.eventType,"ClassSessionScheduleChanged")');
    expect(panel).toContain("Confirm reschedule");
    expect(panel).toContain("Confirm cancellation");
    expect(panel).toContain("buildSiteClassMeetings([");
    expect(source).toContain("OLD.state='cancelled' AND NEW.state<>'cancelled'");
  });
  it("requires learner-accessible media readiness and permits live-room resume",()=>{
    const panel=read("src/components/learning/NativeClassSessionsPanel.tsx");
    expect(panel).toContain("Captions/transcript and readable slides checked");
    expect(panel).toContain("Bandwidth and facilitator recovery plan checked");
    expect(panel).toContain("Resume authorized live controls");
    const schedule=read("src/modules/classes/native-class-sessions.functions.ts");
    expect(schedule).toContain("if(plan.state===\"started\"&&plan.facilitatedSessionId)");
    expect(schedule).toContain("alreadyStarted:true");
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
