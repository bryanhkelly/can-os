import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
describe("native Class evidence consolidates on existing canonical engines",()=>{
  it("ties the read model to the authenticated Person and actual Class Course Attempt",()=>{
    const source=read("src/modules/classes/native-class-canonical-evidence.server.ts");
    const access=read("src/modules/classes/native-learner-class-access.server.ts");
    expect(source).toContain('if(!actor.actorPersonId||actor.role!=="learner")');
    expect(source).toContain('authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"history_read")');
    expect(access).toContain("eq(canonicalClassEnrollments.learnerPersonId,actor.actorPersonId)");
    expect(access).toContain('authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,mode==="history_read",enrollment.id)');
    expect(access).toContain('access.source!=="class"');
    expect(access).toContain("access.courseVersionId!==cls.courseVersionId");
    expect(read("src/modules/classes/native-class-canonical-evidence.functions.ts")).toContain('setResponseHeader("Cache-Control","private, no-store")');
    expect(source).not.toContain('process.env.CAN_UNIFIED_CLASS_COMMANDS_ENABLED');
  });
  it("reuses canonical assessment grants, finalized results and lesson evidence without creating a second ledger",()=>{
    const source=read("src/modules/classes/native-class-canonical-evidence.server.ts");
    for(const name of ["assessmentAccess","assessmentFormAdministrations",
      "assessmentExecutionAttempts","assessmentExecutionResults",
      "learnerLessonProgress","courseLessons","canonicalClassOutcomes"]){
      expect(source).toContain(name);
    }
    expect(source).toContain('eq(assessmentAccess.courseAttemptId,access.courseAttemptId)');
    expect(source).toContain('g.accessStatus==="approved"');
    expect(source).toContain('eq(assessmentFormAdministrations.deploymentId,access.deploymentId)');
    expect(source).toContain('row.resultStatus==="finalized"');
    expect(source).not.toMatch(/tx\.(?:insert|update|delete)\(/);
  });
  it("routes learner Assignments to the canonical adapter and removes parallel activity handlers",()=>{
    const page=read("src/routes/class_.$classId.tsx");
    const model=read("src/db/canonical-v301/classes.ts");
    const packageJson=read("package.json");
    expect(page).toContain("NativeClassCanonicalEvidencePanel");
    expect(page).not.toContain("NativeCourseActivitiesPanel");
    expect(model).not.toContain('educationV30.table("course_activity_sets"');
    expect(model).not.toContain('educationV30.table("class_activity_submissions"');
    expect(packageJson).not.toContain("native-course-activities.test.ts");
  });
  it("retains one existing Course Attempt provenance source and blocks accidental duplicate migrations",()=>{
    const sql=read("database/canonical/v3.0.1/patch-unified-class-course-attempts.sql");
    const readiness=read("docs/acceptance/native-classroom-qa-readiness.md");
    expect(sql).toContain("class_enrollment_id");
    expect(readiness).toContain("patch-unified-class-offerings.sql");
    expect(readiness).toContain("patch-unified-class-course-attempts.sql");
    expect(readiness).not.toContain("patch-unified-class-activities.sql");
    expect(readiness).toContain("existing canonical assessment");
  });
});
