import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source=(path:string)=>readFileSync(path,"utf8");

/** Source wiring assertions protect an intentionally fail-closed pilot design.
 * These checks are NOT a substitute for database RLS, real browser playback,
 * multi-Class Site isolation and physical attendance acceptance tests. */
describe("native facilitated classroom end-to-end wiring",()=>{
  it("connects the single Class learner workspace to QR pairing and Course Attempt evidence",()=>{
    const page=source("src/routes/classes_.$classId.tsx");
    const companion=source("src/components/learning/NativeClassroomCompanion.tsx");
    expect(page).toContain("<NativeClassroomCompanion courseAttemptId={learner.courseAttemptId}/>");
    expect(companion).toContain("FacilitatedLearnerPairing");
    expect(companion).toContain("ClassroomCompanionRoom");
    expect(companion).toContain("getLearnerFacilitatedRoom");
    const learner=source("src/modules/learning/classroom-evidence.functions.ts");
    expect(learner).toContain("authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId)");
    expect(learner).toContain("submitClassroomResponse");
    expect(learner).toContain("facilitatedRoomActivityResponses");
  });
  it("provides a single private teacher control surface distinct from the shared audience display",()=>{
    const page=source("src/routes/classes_.$classId.tsx");
    const host=source("src/components/learning/NativeClassroomHostPanel.tsx");
    const publicPage=source("src/routes/classroom.$sessionId.presentation.tsx");
    expect(page).toContain("canSchedule showConsole");
    expect(host).toContain("ClassroomFacilitatorConsole");
    expect(host).toContain("ClassroomAttendancePanel");
    expect(host).toContain("endFacilitatedLearningRoom");
    expect(host).toContain('"single"|"dual"|"distributed"');
    expect(publicPage).toContain('layout==="single"');
    expect(publicPage).toContain("ClassroomPublicPromptControls");
    expect(publicPage).not.toContain("ClassroomFacilitatorConsole");
    expect(publicPage).not.toContain("ClassroomAttendancePanel");
    expect(publicPage).not.toContain("getClassroomHostActivity");
    expect(publicPage).not.toContain("getClassroomAttendanceRoster");
    expect(publicPage).not.toContain("facilitatedRoomActivityResponses");
    const safe=source("src/components/learning/ClassroomPublicPromptControls.tsx");
    expect(safe).toContain("releaseClassroomActivity");
    expect(safe).not.toContain("getClassroomHostActivity");
    expect(safe).not.toContain("getClassroomAttendanceRoster");
  });
  it("ties joining and activity aggregates to the exact Class rather than stale paired devices",()=>{
    const boundary=source("src/modules/classes/native-class-room-boundary.server.ts");
    const activity=source("src/modules/learning/classroom-evidence.functions.ts");
    const pairing=source("src/modules/learning/classroom-release-boundary.server.ts");
    expect(boundary).toContain("eq(canonicalClassEnrollments.classId,linked.classId)");
    expect(boundary).toContain("eq(canonicalClassEnrollments.courseAttemptId,courseAttemptId)");
    expect(activity).toContain("const native=await nativeClassForRoom(tx,room)");
    expect(activity).toContain("eq(canonicalClassEnrollments.classId,native.classId)");
    expect(activity).toContain('eq(canonicalClassEnrollments.status,"active")');
    expect(activity).toContain("allowed.clear()");
    expect(pairing).toContain("nativeClassRoomParticipant(tx,room,courseAttemptId,participantPersonId)");
  });
  it("rechecks facilitator session on native room closing and protects short-lived private video links",()=>{
    const rooms=source("src/modules/learning/facilitated-learning.functions.ts");
    const projector=source("src/components/learning/ClassroomProjectorPlayer.tsx");
    expect(rooms).toContain("if(await nativeClassForRoom(tx,room))");
    expect(rooms).toContain("await assertCurrentNativeClassFacilitatorSession(tx,host.actor)");
    expect(rooms).toContain("endFacilitatedLearningRoom");
    expect(rooms).toContain("expiresSeconds:30");
    expect(projector).toContain("expiredForNewCommand");
    expect(projector).toContain("getFacilitatedRoomMediaAccess");
    expect(projector).toContain("Recheck approved recording access");
  });
  it("can start native Class recordings before QR pairing, using only the exact Class's enrollment rights",()=>{
    const rooms=source("src/modules/learning/facilitated-learning.functions.ts");
    expect(rooms).toContain("const nativeClass=await assertNativeClassRoomStaff(tx,room)");
    expect(rooms).toContain("eq(canonicalClassEnrollments.classId,nativeClass.classId)");
    expect(rooms).toContain("nativeClassRoomParticipant(tx,room,candidate.attempt.id,candidate.personId)");
    expect(rooms).toContain("if(candidates.length>500)");
  });
  it("requires explicit audited Class staff attendance approval before personal roster or roll call",()=>{
    const staff=source("src/modules/classes/class-staff.functions.ts");
    const roster=source("src/modules/learning/classroom-attendance.functions.ts");
    const boundary=source("src/modules/classes/native-class-room-boundary.server.ts");
    const sql=source("database/canonical/v3.0.1/patch-unified-class-offerings.sql");
    expect(staff).toContain("attendanceAuthorized:data.canVerifyAttendance");
    expect(staff).toContain("end and reassign to change attendance permissions");
    expect(sql).toContain("attendance_authorized boolean NOT NULL DEFAULT false");
    expect(sql).toContain("OLD.attendance_authorized");
    expect(boundary).toContain("assertNativeClassAttendanceReader");
    expect(boundary).toContain('eq(canonicalClassStaffAssignments.attendanceAuthorized,true)');
    expect(roster).toContain("await assertNativeClassAttendanceReader(tx,room,host.actor.actorPersonId!)");
  });
  it("requires an audited exact-Site administrator emergency revocation path",()=>{
    const session=source("src/modules/classes/native-class-sessions.functions.ts");
    const workspace=source("src/routes/classes_.$classId.tsx");
    expect(session).toContain("export const revokeNativeClassSession");
    // An idempotent Class Session open cannot return an old, ended room.
    expect(session).toContain('facilitatedRoomOperationalState(room,now)!=="live"');
    expect(session).toContain("eq(facilitatedLearningSessions.id,plan.facilitatedSessionId)");
    expect(session).toContain("eq(facilitatedLearningSessions.siteId,instance.siteId!)");
    expect(session).toContain("eq(facilitatedLearningSessions.facilitatorPersonId,host.actor.actorPersonId!)");
    expect(session).toContain("schedule a new Session");
    expect(session).toContain('eventCode:"class.session.revoked"');
    expect(session).toContain("await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
    expect(session).toContain('eq(facilitatedLearningSessions.siteId,cls.siteId)');
    expect(session).toContain('state:"ended",endedAt:now');
    const emergency = session.split("export const revokeNativeClassSession=")[1];
    expect(emergency).toBeDefined();
    // An emergency stop remains callable even when normal Class commands
    // are shut off, and it verifies the administrator before idempotence.
    expect(emergency).not.toContain("CAN_UNIFIED_CLASS_COMMANDS_ENABLED");
    expect(emergency).not.toContain("requireFacilitatedLearningEnabled()");
    expect(emergency.indexOf("await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)"))
      .toBeLessThan(emergency.indexOf('if(room.state==="ended")'));
    expect(workspace).toContain("canRevoke onChanged={refresh}");
  });
  it("keeps projector media refresh and captions rights-checked, without claiming attendance",()=>{
    const projector=source("src/components/learning/ClassroomProjectorPlayer.tsx");
    const media=source("src/components/learning/ClassroomMediaSurface.tsx");
    expect(projector).toContain("loaded.refreshTick===refreshTick");
    expect(projector).toContain("getFacilitatedRoomMediaAccess");
    expect(projector).toContain("resumeAt.current");
    expect(media).toContain("captionTracks.filter(validCaptionTrack)");
    expect(media).toContain('url.protocol==="https:"');
    expect(media).toContain('kind="captions"');
    expect(media).toContain("does not");
    const companion=source("src/components/learning/ClassroomCompanionRoom.tsx");
    expect(companion).toContain("setOnline(navigator.onLine)");
    expect(companion).toContain("refetchOnReconnect:true");
    expect(companion).toContain("You're offline");
    expect(companion).toContain("retryIds.current[key]");
  });
  it("disambiguates same-Course enrollments by exact native Class and Site",()=>{
    const choices=source("src/modules/learning/classroom-connect.functions.ts");
    const join=source("src/routes/join.tsx");
    expect(choices).toContain("classId:canonicalClasses.id");
    expect(choices).toContain("classTitle:canonicalClasses.title");
    expect(choices).toContain("siteName:canonicalEnrollmentSites.name");
    expect(choices).toContain("classId:candidate.classId");
    expect(join).toContain("if(chosen?.classId)");
    expect(join).toContain('to:"/classes/$classId"');
    expect(join).toContain('search:{view:"learn",tab:"sessions"}');
    // A QR code is never sufficient to choose the wrong Class or create one.
    expect(join).toContain("pairWithFacilitatedRoom");
    expect(join).not.toContain("createNativeClassEnrollment");
  });
  it("shows a permitted enrollment path without silently enrolling QR visitors",()=>{
    const join=source("src/routes/join.tsx");
    expect(join).toContain('to="/learn/classes"');
    expect(join).toContain("Scanning a QR code never enrolls you");
    expect(join).toContain("getClassroomConnectCourseChoices");
    expect(join).not.toContain("enrollInClassroom");
  });
});
