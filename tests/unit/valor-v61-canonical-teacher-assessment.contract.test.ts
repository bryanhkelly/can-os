import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("Valor native teacher and student knowledge checks",()=>{
  const session=read("src/modules/identity/canonical-command-context.server.ts");
  const workspace=read("src/modules/classes/native-class-workspace.functions.ts");
  const home=read("src/modules/classes/native-class-teacher-home.functions.ts");
  const review=read("src/modules/classes/native-class-teacher-homework.functions.ts");
  const teacherAuthority=read("src/modules/classes/native-class-teacher-authority.server.ts");
  const quiz=read("src/modules/learning/noncredit-assessment.server.ts");
  const scope=read("src/modules/learning/native-class-assessment-scope.server.ts");
  const readiness=read("src/modules/classes/native-class-knowledge-check-availability.functions.ts");
  const route=read("src/routes/class_.$classId.tsx");
  const classHome=read("src/routes/class.tsx");
  const studentPanel=read("src/components/learning/NativeClassKnowledgeCheckPanel.tsx");

  it("admits a directly verified CAN teacher only with a named Site grant",()=>{
    expect(session).toContain('actor.role === "teacher"');
    expect(session).toContain('actor.grantSiteId');
    expect(session).toContain('actor.scope.organizationIds?.length === 1');
    expect(session).toContain('actor.capabilities.has("teacher:read")');
    expect(home).toContain('actor.role!=="teacher"');
    expect(home).toContain('eq(canonicalClassStaffAssignments.roleCode,"teacher")');
    expect(home).toContain("currentClassAuthority(tx,row.id,now)");
    expect(classHome).toContain("getMyNativeTeachingClasses()");
  });

  it("does not treat a room facilitator, Site manager, or assignment alone as teaching authority",()=>{
    expect(workspace).toContain('actor.role==="teacher"');
    expect(workspace).toContain('eq(canonicalClassStaffAssignments.roleCode,"teacher")');
    expect(workspace).toContain('eq(canonicalClassStaffAssignments.state,"approved")');
    expect(workspace).toContain('await currentClassAuthority(tx,instance.id,now)');
    expect(workspace).toContain("assertCurrentNativeTeachingGrant(");
    expect(workspace).toContain("canControlRoom=true");
    expect(workspace).toContain("learner,staffRole,canVerifyAttendance,canControlRoom");
    expect(route).toContain("canSchedule={workspace.canControlRoom}");
    expect(route).toContain("workspace.canControlRoom");
  });

  it("shows bounded homework only for exact verified Class and Course Attempt",()=>{
    expect(teacherAuthority).toContain('assertCapability(actor,"teacher:read")');
    expect(teacherAuthority).toContain('eq(canonicalClassStaffAssignments.state,"approved")');
    expect(teacherAuthority).toContain('await currentClassAuthority(tx,cls.id,now)');
    expect(review).toContain("assertNativeClassTeacher(tx,actor,classId)");
    expect(review).toContain("ce.course_attempt_id=ca.id");
    expect(review).toContain("ca.section_id IS NULL");
    expect(review).toContain("LIMIT 101");
    expect(review).toContain("canRecordOfficialGrade:false");
    expect(review).not.toContain("INSERT INTO public.grading_decisions");
    expect(route).toContain("<NativeClassTeacherHomeworkPanel");
  });

  it("reuses published objective assessment engine for Class students without impersonating noncredit learners",()=>{
    expect(quiz).toContain('context.role==="student"');
    expect(quiz).toContain('assertCapability(context,"student:read")');
    expect(quiz).toContain('if(access.source==="class")');
    expect(quiz).toContain('loadNativeClassAssessmentScope(');
    expect(quiz).toContain('if(context.role!=="learner"||access.source!=="noncredit"');
    expect(scope).toContain('eq(assessmentVersions.lifecycle,"published")');
    expect(scope).toContain('eq(assessmentFormVersions.lifecycle,"published")');
    expect(scope).toContain('assessmentAccess.learnerId');
    expect(readiness).toContain("authorizeCanonicalCourseAttempt(");
    expect(readiness).toContain('readNoncreditKnowledgeCheck(actor,data.courseAttemptId,"final")');
    expect(studentPanel).toContain('<CourseAssessmentPanel courseAttemptId={courseAttemptId} context="class"');
    expect(route).toContain("<NativeClassKnowledgeCheckPanel");
  });

  it("keeps teacher publication previews read-only",()=>{
    expect(review).toContain("getNativeClassTeacherAssessments");
    expect(review).toContain("aa.deployment_id");
    expect(review).toContain("av.lifecycle AS version_lifecycle");
    expect(route).toContain("<NativeClassTeacherAssessmentPanel");
    expect(review).not.toContain("UPDATE public.assessment_versions");
    expect(review).not.toContain("INSERT INTO public.assessment_attempts");
  });
});
