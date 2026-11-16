import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");
describe("exact noncredit release membership in linked classroom",()=>{
  it("uses Site, Course, organization and exact release, never only Deployment",()=>{
    const boundary=read("src/modules/learning/classroom-release-boundary.server.ts");
    expect(boundary).toContain("eq(facilitatedClassroomPlans.facilitatedSessionId,room.id)");
    expect(boundary).toContain('plan.state!=="started"');
    expect(boundary).toContain("noncreditSelfEnrollmentReleases.registeringOrganizationId");
    expect(boundary).toContain("noncreditSelfEnrollmentClaims.releaseId,releaseId");
    expect(boundary).toContain("noncreditSelfEnrollmentClaims.participantPersonId,participantPersonId");
    expect(boundary).toContain("noncreditSelfEnrollmentClaims.siteId,room.siteId");
    expect(boundary).toContain("learnerCourseAttempts.noncreditRegistrationId");
  });
  it("limits roster to linked release before the bounded SQL query",()=>{
    const api=read("src/modules/learning/classroom-attendance.functions.ts");
    expect(api).toContain("const releaseScope=await assignedClassroomRelease(tx,room)");
    expect(api).toContain("eq(noncreditSelfEnrollmentClaims.releaseId,releaseScope)");
    expect(api).toContain("registeredRoomParticipant(tx,room,attempt.id,releaseScope)");
    expect(api).toContain("attemptInAssignedClassroomRelease(");
    expect(api).not.toContain("const [pairs,attestations,persons]=await Promise.all");
    const start=api.indexOf("const pairs=ids.length?");
    const end=api.indexOf("const paired=",start);
    expect(start).toBeGreaterThan(0);
    expect(api.slice(start,end)).not.toContain("Promise.all");
  });
  it("denies cross-release access for QR, live media, activities, survey and assisted practice",()=>{
    const room=read("src/modules/learning/facilitated-learning.functions.ts");
    const helpers=read("src/modules/learning/facilitated-learning-operations.server.ts");
    expect((room+helpers).match(/attemptInAssignedClassroomRelease\(/g)?.length).toBeGreaterThanOrEqual(3);
    expect(read("src/modules/learning/classroom-evidence.functions.ts"))
      .toContain("attemptInAssignedClassroomRelease(");
    expect(read("src/modules/learning/classroom-surveys.functions.ts"))
      .toContain("attemptInAssignedClassroomRelease(");
    expect(read("src/modules/learning/classroom-assisted-activity.functions.ts"))
      .toContain("registeredRoomParticipant(tx,room,data.courseAttemptId)");
  });
  it("keeps host response and presence counts within current cohort",()=>{
    const api=read("src/modules/learning/classroom-evidence.functions.ts");
    expect(api).toContain("const releaseScope=await assignedClassroomRelease(tx,room)");
    expect(api).toContain("allowed.has(a.courseAttemptId)");
    expect(api).toContain("pairedCount: allowed.size");
  });
});
