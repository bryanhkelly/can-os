import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Valor V6.1 native synthetic student journey",()=>{
  const session=read("src/modules/identity/canonical-command-context.server.ts");
  const list=read("src/modules/classes/native-valor-demo-student.functions.ts");
  const classWorkspace=read("src/modules/classes/native-class-workspace.functions.ts");
  const classroom=read("src/modules/classes/native-class-learning.functions.ts");
  const homework=read("src/modules/classes/native-class-homework.functions.ts");
  const route=read("src/routes/class.tsx");
  const detail=read("src/routes/class_.$classId.tsx");

  it("requires Jordan-style direct CAN student Site membership, not an adult native cookie",()=>{
    expect(session).toContain('actor.role === "student"');
    expect(session).toContain('actor.capabilities.has("student:read")');
    expect(session).toContain("return actor;");
    expect(list).toContain('actor.role==="student"');
    expect(list).toContain('!actor.sessionAccountId');
    expect(list).toContain('actor.grantSiteId===VALOR_SITE');
    expect(list).toContain('metadata @> \'{"synthetic":true}\'');
    expect(route).toContain("getValorStudentClasses()");
    expect(route).toContain('<ValorStudentClassHome');
  });

  it("never recreates retired Sections or Cohorts as an instructional source",()=>{
    for(const source of [list,homework,classroom]){
      expect(source).not.toMatch(/from\s*\(?(?:\s*)sections\b|public\.sections\b|course_sections\b|program_cohorts\b/i);
    }
    expect(list).toContain("canonicalClassEnrollments");
    expect(homework).toContain("public.graded_assignments");
    expect(homework).toContain("public.graded_submissions");
  });

  it("creates the active synthetic Course Attempt after the Class is active",()=>{
    expect(list).toContain('eq(canonicalClassEnrollments.status,"pending")');
    const activate=list.indexOf('await tx.update(canonicalClassEnrollments).set({status:"active"})');
    const insert=list.indexOf('const [attempt]=await tx.insert(learnerCourseAttempts)');
    expect(activate).toBeGreaterThan(0);
    expect(insert).toBeGreaterThan(activate);
    expect(list).toContain('currentClassAuthority(tx,c.id,new Date())');
    expect(list).toContain("consentAccepted:z.literal(true)");
    expect(list).toContain("participationAttributions");
  });

  it("requires the exact CAN student Site and authorized Class Course Attempt for study",()=>{
    expect(classWorkspace).toContain('actor.role==="student"');
    expect(classroom).toContain('actor.role==="student"');
    expect(classroom).toContain("authorizeCanonicalCourseAttempt(");
    expect(classroom).toContain("getInstructionalLearnerContext(getRequest())");
    expect(classroom).toContain("learnerLessonProgress");
    expect(detail).toContain("NativeValorLessonPanel");
  });

  it("stores written homework on the same canonical Course Attempt without overwriting submitted work",()=>{
    expect(homework).toContain('eq(canonicalClassEnrollments.status, "active")');
    expect(homework).toContain('actor.role==="student"');
    expect(homework).toContain("authorizeCanonicalCourseAttempt(");
    expect(homework).toContain("public.graded_submissions");
    expect(homework).toContain('prior.status==="submitted"');
    expect(homework).toContain('prior.status!=="assigned" && prior.status!=="returned"');
    expect(homework).toContain("ON CONFLICT (course_attempt_id,assignment_id) DO NOTHING");
    expect(detail).toContain("NativeClassHomeworkPanel");
  });
});
