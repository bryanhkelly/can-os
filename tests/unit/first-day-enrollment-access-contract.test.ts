import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path:string) =>
  readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Phase D live family-to-school handoff contracts",()=>{
  it("starts onsite readiness only from an authorized, accepted real application",()=>{
    const source=read("src/modules/enrollment/first-school-day-handoff.functions.ts");
    expect(source).toContain('actor.role !== "registrar"');
    expect(source).toContain('assertCapability(actor,"enrollment.activate")');
    expect(source).toContain('actor.scope.programIds?.includes(app.programId)');
    expect(source).toContain('app.stage !== "accepted"');
    expect(source).toContain('app.programStatus !== "active"');
    expect(source).toContain("siteDate(new Date(),app.timezone)");
  });
  it("uses canonical scheduled roster and real reviewed supervision rather than assuming presence",()=>{
    const source=read("src/modules/enrollment/first-school-day-handoff.functions.ts");
    expect(source).toContain("loadExpectedOnsiteRosterForActor");
    expect(source).toContain("loadOnsiteSupervisionPlanForActor");
    expect(source).toContain('student.studentProfileId===app.studentProfileId');
    expect(source).toContain("deriveFirstSchoolDayHandoff");
    expect(source).not.toContain("insert(attendanceEvents)");
    expect(source).not.toContain("recordAttendanceRevision");
  });
  it("keeps active student grants distinct from historic approved guardian consent",()=>{
    const service=read("src/modules/enrollment/student-access-handoff.functions.ts");
    const statusRead=service.slice(
      service.indexOf("export const getStudentLearningHandoff="),
      service.indexOf("export const provisionStudentLearningAccess="));
    expect(statusRead).toContain('consent?.status==="approved"');
    expect(statusRead).toContain('eq(accountPersonGrants.active,true)');
    expect(statusRead).toContain('eq(accessAccounts.disabled,false)');
    expect(statusRead).toContain('eq(accountPersonGrants.role,"student")');
    expect(statusRead).toContain('eq(accountPersonGrants.isSynthetic,false)');
    expect(statusRead).toContain('status:"access_unavailable"');
    const ui=read("src/components/enrollment/StudentLearningAccessHandoff.tsx");
    expect(ui).toContain('status==="access_unavailable"');
    expect(ui).toContain("A sign-in link");
    expect(ui).toContain("cannot restore a revoked grant");
  });
  it("keeps the live first-day checkpoint connected to the admissions workspace",()=>{
    const admissions=read("src/routes/admissions.index.tsx");
    expect(admissions).toContain("FirstSchoolDayHandoff");
    expect(admissions).toContain("StudentLearningAccessHandoff");
    expect(admissions).toContain("Review revoked student access");
    const handoff=read("src/components/enrollment/FirstSchoolDayHandoff.tsx");
    expect(handoff).toContain("the Program's official attendance roster");
    expect(handoff).toContain('to="/site/day"');
    expect(handoff).toContain("not opening authorization");
  });
});
