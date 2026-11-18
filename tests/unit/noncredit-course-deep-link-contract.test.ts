import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const enrollment=readFileSync(
  new URL("../../src/modules/enrollment/noncredit-self-enrollment.functions.ts",import.meta.url),
  "utf8",
);
const courseRoute=readFileSync(
  new URL("../../src/routes/learn.course.$courseAttemptId.tsx",import.meta.url),
  "utf8",
);

describe("adult learner bookmarked Course Attempt access",()=>{
  it("resolves the exact owned attempt instead of checking only the first 100 registrations",()=>{
    expect(enrollment).toContain("export const getMyNoncreditCourseByAttemptId=createServerFn");
    expect(enrollment).toContain("courseAttemptId:z.string().uuid()");
    expect(enrollment).toContain("readMyNoncreditHistoryPage(null,undefined,data.courseAttemptId)");
    expect(enrollment).toContain("courseAttemptId?eq(learnerCourseAttempts.id,courseAttemptId):undefined");
    expect(courseRoute).toContain("getMyNoncreditCourseByAttemptId({data:{courseAttemptId:params.courseAttemptId}})");
    expect(courseRoute).not.toContain("getMyNoncreditSelfEnrollments()");
  });

  it("retains the verified CAN Account, canonical Person, and original enrollment claim boundary",()=>{
    const read=enrollment.slice(
      enrollment.indexOf("async function readMyNoncreditHistoryPage("),
      enrollment.indexOf("export const getMyNoncreditSelfEnrollmentHistoryPage"),
    );
    expect(read).toContain("getCommandContext(getRequest())");
    expect(read).toContain("owner.personId!==actor.actorPersonId");
    expect(read).toContain("link.accessPersonId!==owner.personId");
    expect(read).toContain("eq(noncreditSelfEnrollmentClaims.canonicalAccountId,link.canonicalAccountId)");
    expect(read).toContain("eq(noncreditSelfEnrollmentClaims.participantPersonId,link.canonicalPersonId)");
    expect(read).toContain("eq(noncreditRegistrations.participantPersonId,link.canonicalPersonId)");
  });
});
