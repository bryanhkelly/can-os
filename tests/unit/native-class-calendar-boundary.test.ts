import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read=(p:string)=>readFileSync(resolve(process.cwd(),p),"utf8");

describe("native Class Session lifecycle cannot be mutated by generic calendar",()=>{
  it("blocks generic reschedule and cancellation before writing or auditing",()=>{
    const code=read("src/modules/learning/classroom-scheduling.functions.ts");
    const check=code.indexOf("async function assertGenericCalendarMutation(");
    expect(check).toBeGreaterThan(-1);
    expect(code.slice(check,check+610)).toContain(
      "eq(canonicalClassSessions.classroomPlanId,planId)");
    expect(code.slice(check,check+700)).toContain("if(native)throw new AuthorizationError(");
    for(const endpoint of ["rescheduleClassroom","cancelClassroomPlan"]){
      const begin=code.indexOf("export const "+endpoint+"=");
      expect(begin).toBeGreaterThan(0);
      const handler=code.slice(begin,code.indexOf("export const ",begin+10));
      expect(handler.indexOf("await assertGenericCalendarMutation(tx,plan.id)")).toBeGreaterThan(-1);
      expect(handler.indexOf("await assertGenericCalendarMutation(tx,plan.id)"))
        .toBeLessThan(handler.indexOf("await tx.update("));
    }
  });
  it("lists native Sessions separately and hides generic calendar mutations",()=>{
    const api=read("src/modules/learning/classroom-scheduling.functions.ts");
    expect(api).toContain("nativeClassId:nativeByPlan.get(row.plan.id)?.classId??null");
    expect(api).toContain("nativeClassSessionId:nativeByPlan.get(row.plan.id)?.classSessionId??null");
    const ui=read("src/components/learning/ClassroomSchedulePanel.tsx");
    expect(ui).toContain('plan.state==="scheduled"&&!plan.nativeClassId');
    expect(ui).toContain('to="/class/$classId"');
    expect(ui).toContain("Manage native Class Sessions");
  });
  it("preserves the separate native Session change and audit lifecycle",()=>{
    const native=read("src/modules/classes/native-class-sessions.functions.ts");
    expect(native).toContain("export const changeNativeClassSessionSchedule");
    expect(native).toContain("ClassSessionScheduleChanged");
    expect(native).toContain('state:"cancelled"');
    expect(native).toContain("replacementSessionId");
  });
});

describe("native Class admission identity and capacity retry",()=>{
  it("labels approved seat admissions as approvals, not as self-registration",()=>{
    const source=read("src/modules/classes/native-class-enrollment.functions.ts");
    expect(source).toContain(
      'assertNativeClassSeatAvailable({method:invitation?"invitation":approval?"approval":"self"');
  });
  it("revalidates the current learner session before returning an existing enrollment",()=>{
    const source=read("src/modules/classes/native-class-enrollment.functions.ts");
    const start=source.indexOf("const existing=previous[0];");
    const end=source.indexOf("const [completed]=",start);
    expect(start).toBeGreaterThan(0);
    const branch=source.slice(start,end);
    expect(branch).toContain("await assertCurrentNativeClassLearnerForMutation(tx,request,actor)");
    expect(branch).toContain("alreadyEnrolled:true");
    expect(branch.indexOf("assertCurrentNativeClassLearnerForMutation"))
      .toBeLessThan(branch.indexOf("alreadyEnrolled:true"));
  });
});
