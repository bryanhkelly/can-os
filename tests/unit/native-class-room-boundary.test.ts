import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
describe("native Class room isolation contract",()=>{
  it("requires a Class-bound Room and exact native enrollment on every pairing",()=>{
    const source=read("src/modules/learning/classroom-release-boundary.server.ts");
    expect(source).toContain("nativeClassRoomParticipant(tx,room,courseAttemptId,participantPersonId)");
    const pairing=read("src/modules/learning/facilitated-learning.functions.ts");
    expect(pairing).toContain("attemptInAssignedClassroomRelease(");
    expect(pairing).toContain('attempt.source!=="class"');
  });
  it("rechecks live Class staff and refuses non-Class room access to native attempts",()=>{
    const source=read("src/modules/classes/native-class-room-boundary.server.ts");
    expect(source).toContain('throw new AuthorizationError("Class Course Attempt cannot join an unbound room")');
    expect(source).toContain("assertNativeClassRoomStaff");
    expect(source).toContain("assertCurrentNativeTeachingGrant");
    expect(source).toContain("eq(canonicalAccountGrants.roleCode,\"room_facilitator\")");
    expect(source).toContain("canonicalClassStaffAssignments");
    expect(source).toContain("currentClassAuthority");
    const room=read("src/modules/learning/facilitated-learning.functions.ts");
    expect(room).toContain("await assertNativeClassRoomStaff(tx,room)");
  });
  it("prevents room playback and roll calls from selecting a different Class",()=>{
    const room=read("src/modules/learning/facilitated-learning.functions.ts");
    expect(room).toContain("nativeClassRoomParticipant(tx,room,attempt.id,participantPersonId)");
    const attendance=read("src/modules/learning/classroom-attendance.functions.ts");
    expect(attendance).toContain("eq(canonicalClassEnrollments.classId,native.classId)");
    expect(attendance).toContain("assertNativeClassAttendanceReader");
  });
  it("keeps native Class Session plans immutable and disjoint from noncredit releases",()=>{
    const sql=read("database/canonical/v3.0.1/patch-unified-class-offerings.sql");
    expect(sql).toContain("canonical_class_session_guard_trg");
    expect(sql).toContain("canonical_class_plan_boundary_trg");
    expect(sql).toContain("NEW.enrollment_release_id IS NOT NULL");
    // A previously native Class room must never become unbound and fall
    // through to legacy Course/Site pairing or playback rules.
    expect(sql).toContain("NEW.facilitated_session_id IS DISTINCT FROM OLD.facilitated_session_id");
    expect(sql).toContain("OLD.state='started' AND NEW.state<>'started'");
    const scheduling=read("src/modules/learning/classroom-scheduling.functions.ts");
    expect(scheduling).toContain("native Class room controls are not yet released");
    expect(scheduling).toContain("canonicalClassStaffAssignments");
  });
});
