import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classroomAttendanceNeedsExplanation,classroomAttestationOpen,
  summarizeVerifiedRoomAttendance,
} from "@/domain/classroom-attendance";
import {
  canOpenScheduledClassroom,validClassroomScheduleWindow,
} from "@/domain/classroom-scheduling";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");
const now=new Date("2026-11-16T12:00:00.000Z");
const after=(ms:number)=>new Date(now.getTime()+ms);
const minute=60_000;

describe("Release 3 canonical scheduled classroom windows",()=>{
  it("permits 15-minute through eight-hour planned sessions, 5 minutes to 180 days ahead",()=>{
    expect(validClassroomScheduleWindow(after(5*minute),after(20*minute),now)).toBe(true);
    expect(validClassroomScheduleWindow(after(5*minute),after(5*minute+8*60*minute),now)).toBe(true);
    expect(validClassroomScheduleWindow(after(5*minute-1),after(25*minute),now)).toBe(false);
    expect(validClassroomScheduleWindow(after(10*minute),after(20*minute),now)).toBe(false);
    expect(validClassroomScheduleWindow(after(10*minute),after(10*minute+8*60*minute+1),now)).toBe(false);
    expect(validClassroomScheduleWindow(after(181*24*60*minute),after(181*24*60*minute+30*minute),now)).toBe(false);
  });
  it("only opens in the fifteen-minute early window, never after the planned end",()=>{
    expect(canOpenScheduledClassroom(after(15*minute),after(60*minute),now)).toBe(true);
    expect(canOpenScheduledClassroom(after(15*minute+1),after(60*minute),now)).toBe(false);
    expect(canOpenScheduledClassroom(after(-60*minute),now,now)).toBe(false);
    expect(canOpenScheduledClassroom(after(-60*minute),after(1),now)).toBe(true);
  });
  it("records calendar against canonical delivery sessions and never makes an enrollment",()=>{
    const model=read("src/db/canonical-v301/classroom-planning.ts");
    const server=read("src/modules/learning/classroom-scheduling.functions.ts");
    const sql=read("database/canonical/v3.0.1/patch-facilitated-classroom-plans.sql");
    expect(model).toContain('pgTable("delivery_sessions"');
    expect(sql).toContain("facilitated_plans_delivery_session_uq");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(server).toContain("createFacilitatedRoomForHost(tx,host");
    expect(server).toContain("approvedSiteCourse(tx,host");
    expect(server).toContain('state:"cancelled"');
    expect(server).toContain("return {saved:true,unchanged:true}");
    expect(server).toContain("auditPlan(tx,host");
    expect(server).not.toContain("tx.insert(enrollments)");
  });
});

describe("Release 3 independent facilitator and assisted activity evidence",()=>{
  it("keeps canonical facilitated server-function exports compatible with TanStack Babel parsing",()=>{
    const facade=read("src/modules/learning/facilitated-learning.functions.ts");
    const privileged=read("src/modules/learning/facilitated-learning-operations.server.ts");
    const attendance=read("src/modules/learning/classroom-attendance.functions.ts");
    const attendancePrivileged=read("src/modules/learning/classroom-attendance-operations.server.ts");
    for(const source of [facade,privileged,attendance,attendancePrivileged]){
      expect(source).not.toMatch(/\bexport\s+export\b|\bexport\s+async\s+export\b/);
    }
    // Browser-importable facades export server functions, not internal
    // database helpers whose server-only imports would leak to the client.
    expect(facade).not.toMatch(/export async function /);
    expect(attendance).not.toMatch(/export async function /);
    expect(facade).not.toContain('from "node:crypto"');
    expect(privileged).toContain("export async function selfEnrolledNoncreditRoomSitePermitted(");
    expect(privileged).toContain("attemptInAssignedClassroomRelease(");
    expect(attendancePrivileged).toContain("export async function registeredRoomParticipant(");
    expect(attendancePrivileged).toContain("attemptInAssignedClassroomRelease(");
    expect(attendancePrivileged).toContain("eq(noncreditSelfEnrollmentClaims.releaseId,releaseId)");
  });
  it("supports a 48-hour append-only correction period",()=>{
    const room={startedAt:now,endedAt:after(60*minute)};
    expect(classroomAttestationOpen(room,after(60*minute))).toBe(true);
    expect(classroomAttestationOpen(room,after(49*60*minute-1))).toBe(true);
    expect(classroomAttestationOpen(room,after(49*60*minute))).toBe(false);
    expect(classroomAttestationOpen({startedAt:now,endedAt:null},after(56*60*minute))).toBe(false);
    expect(classroomAttestationOpen({startedAt:now,endedAt:null},after(56*60*minute-1))).toBe(true);
    expect(classroomAttestationOpen(room,after(-1))).toBe(false);
  });
  it("requires an explanation when no device is paired or evidence changes",()=>{
    const baseline={pairedDevice:true,nextStatus:"present",nextMethod:"in_person_roll_call"};
    expect(classroomAttendanceNeedsExplanation(baseline)).toBe(false);
    expect(classroomAttendanceNeedsExplanation({...baseline,pairedDevice:false})).toBe(true);
    expect(classroomAttendanceNeedsExplanation({...baseline,previousStatus:"present",previousMethod:"in_person_roll_call"})).toBe(false);
    expect(classroomAttendanceNeedsExplanation({...baseline,previousStatus:"absent",previousMethod:"in_person_roll_call"})).toBe(true);
    expect(classroomAttendanceNeedsExplanation({...baseline,previousStatus:"present",previousMethod:"remote_live_check"})).toBe(true);
  });
  it("never impersonates a device-paired learner or writes official grades",()=>{
    const service=read("src/modules/learning/classroom-attendance.functions.ts");
    const assisted=read("src/modules/learning/classroom-assisted-activity.functions.ts");
    const sql=read("database/canonical/v3.0.1/patch-facilitated-assisted-activity.sql");
    expect(service).toContain("registeredRoomParticipant(tx,room");
    const privileged=read("src/modules/learning/classroom-attendance-operations.server.ts");
    expect(privileged).toContain("schoolAttemptIsPlacedAtSite(");
    expect(privileged).toContain("selfEnrolledNoncreditRoomSitePermitted");
    expect(service).toContain("facilitatedRoomAttendanceAssertions");
    expect(service).toContain("learning.classroom.attendance.corrected");
    expect(assisted).toContain("registeredRoomParticipant(tx,room,data.courseAttemptId)");
    expect(assisted).toContain("facilitatedRoomAssistedActivityEvidence");
    expect(assisted).toContain("facilitatorAttributed:true");
    expect(assisted).toContain("Conflicting assisted activity retry");
    expect(assisted).not.toContain("tx.insert(facilitatedRoomActivityResponses)");
    expect(assisted).not.toContain("tx.insert(assessmentAttempts)");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  });
});

describe("Release 3 governed survey delivery",()=>{
  it("only connects consented, personally invited, published identified surveys",()=>{
    const api=read("src/modules/learning/classroom-surveys.server.ts");
    const companion=read("src/routes/classroom.companion.tsx");
    expect(api).toContain('eq(surveyCampaigns.responseMode,"identified")');
    expect(api).toContain('eq(surveyVersions.lifecycle,"published")');
    expect(api).toContain('isNotNull(evidenceDocumentVersions.verifiedByPersonId)');
    expect(api).toContain("eq(surveyInvitations.invitedPersonId,personId)");
    expect(api).toContain('access.source!=="noncredit"');
    expect(api).toContain('currentRoomParticipantPermitted(tx,room,access,personId,new Date())');
    expect(api).toContain('if(link.stage==="exit"&&roomState==="live"&&!pair.leftAt)continue');
    expect(api).not.toContain("tx.insert(surveyResponses)");
    expect(api).not.toContain("tx.insert(surveyAnswers)");
    expect(companion).toContain("ClassroomGovernedLearnerSurveys");
    expect(read("src/components/learning/ClassroomGovernedLearnerSurveys.tsx"))
      .toContain("<CourseSurveyPanel");
  });
  it("keeps privileged attendance, assisted responses and survey links off the shared screen",()=>{
    const projector=read("src/routes/classroom.$sessionId.presentation.tsx");
    const feed=read("src/modules/learning/classroom-evidence.functions.ts");
    expect(projector).toContain("getClassroomPresentationState");
    expect(projector).not.toContain("getClassroomAttendanceRoster");
    expect(projector).not.toContain("getClassroomSurveyOptions");
    expect(projector).not.toContain("facilitatedRoomAssistedActivityEvidence");
    const safe=feed.slice(feed.indexOf("export const getClassroomPresentationState"));
    expect(safe).not.toContain("facilitatedRoomAttendanceAssertions");
    expect(safe).not.toContain("facilitatedRoomAssistedActivityEvidence");
    expect(safe).not.toContain("surveyAnswers");
  });
});

describe("Phase 2 linked-room attendance reconciliation",()=>{
  it("counts only latest verified presence by exact room and Course attempt",()=>{
    const summary=summarizeVerifiedRoomAttendance([
      {roomId:"church-a-session-1",attemptId:"adult-a",status:"absent"},
      {roomId:"church-a-session-2",attemptId:"adult-a",status:"present"},
      {roomId:"church-a-session-1",attemptId:"adult-a",status:"present"},
      {roomId:"church-b-session-1",attemptId:"adult-b",status:"present"},
      {roomId:"church-b-session-1",attemptId:"adult-b",status:"absent"},
    ]);
    expect(summary.presentPairs.has("church-a-session-1:adult-a")).toBe(false);
    expect(summary.presentPairs.has("church-a-session-2:adult-a")).toBe(true);
    expect(summary.presentPairs.has("church-b-session-1:adult-b")).toBe(true);
    expect(summary.verifiedAttendeesByRoom.get("church-a-session-1")).toBe(0);
    expect(summary.verifiedAttendeesByRoom.get("church-a-session-2")).toBe(1);
    expect(summary.verifiedAttendeesByRoom.get("church-b-session-1")).toBe(1);
    expect([...summary.presentAttemptIds].sort()).toEqual(["adult-a","adult-b"]);
  });
  it("does not count a no-device or unknown assertion as independently verified present",()=>{
    const summary=summarizeVerifiedRoomAttendance([
      {roomId:"room",attemptId:"adult",status:"unknown"},
    ]);
    expect(summary.presentPairs.size).toBe(0);
    expect(summary.verifiedAttendeesByRoom.get("room")).toBe(0);
  });
  it("keeps cohort and provider Site reporting on the same correction projector",()=>{
    const cohort=read("src/modules/enrollment/noncredit-cohort-operations.functions.ts");
    const network=read("src/modules/enrollment/noncredit-network-report.server.ts");
    const operator=read("src/components/enrollment/NoncreditReleaseOperations.tsx");
    for(const source of [cohort,network]){
      expect(source).toContain("summarizeVerifiedRoomAttendance(");
      expect(source).toContain("currentNoncreditCompletionStates(");
    }
    expect(cohort).toContain("verifiedAttendeesByRoom.get(p.roomId)");
    expect(operator).toContain("session.verifiedAttendees");
    expect(operator).toContain("session.roomOpened");
    expect(network).toContain("const {presentPairs:present}=summarizeVerifiedRoomAttendance(asserted)");
  });
});
