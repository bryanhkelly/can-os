import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");

describe("CAN V6.1 canonical student Class experience in any Site",()=>{
 const session=read("src/modules/identity/canonical-command-context.server.ts");
 const list=read("src/modules/classes/native-class-student-home.functions.ts");
 const classWorkspace=read("src/modules/classes/native-class-workspace.functions.ts");
 const learning=read("src/modules/classes/native-class-learning.functions.ts");
 const homework=read("src/modules/classes/native-class-homework.functions.ts");
 const access=read("src/modules/classes/native-learner-class-access.server.ts");
 const canonical=read("src/modules/learning/canonical-course-participation.server.ts");
 const route=read("src/routes/class.tsx");
 const detail=read("src/routes/class_.$classId.tsx");

 it("allows server-authorized demo-admin student switching without bypassing Person or Class checks",()=>{
   expect(session).toContain('if (actor.role === "student")');
   expect(session).not.toContain('if (!actor.actorPersonId || actor.sessionAccountId ||');
   expect(session).toContain('actor.grantSiteId');
   expect(session).toContain('actor.capabilities.has("student:read")');
   expect(classWorkspace).toContain('canonicalClassEnrollments');
 });
 it("uses an authorized current CAN student Site grant, not a synthetic ID",()=>{
   expect(session).toContain('actor.role === "student"');
   expect(session).toContain('actor.capabilities.has("student:read")');
   expect(list).toContain('actor.role!=="student"');
   expect(list).toContain("actor.grantSiteId");
   expect(list).toContain("currentClassAuthority");
   expect(list).not.toContain("VALOR_SITE");
   expect(list).not.toContain('metadata @> \'{"synthetic":true}\'');
   expect(route).toContain("getMyStudentClasses()");
   expect(route).toContain("<NativeStudentClassHome");
 });
 it("never creates an alternative Class, Course Attempt, or student enrollment",()=>{
   for(const code of [list,access,learning]){
     expect(code).not.toMatch(/from\s*\(?\s*sections\b|public\.sections\b|course_sections\b|program_cohorts\b/i);
   }
   expect(list).toContain("canonicalClassEnrollments");
   expect(list).not.toContain("tx.insert");
   expect(homework).toContain("public.graded_submissions");
   // The migration-only legacy evidence lookup is read-only and exact-ID scoped.
   expect(homework).not.toMatch(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+public\.sections\b/i);
   expect(homework).toContain("md5('valor-v61:classenrollment:'");
   expect(homework).toContain("md5('valor-v61:class:'");
 });
 it("uses exact CAN Person, current Enrollment and Course Attempt",()=>{
   expect(classWorkspace).toContain('actor.role==="student"');
   expect(access).toContain('actor.role==="student"');
   expect(access).toContain("authorizeCanonicalCourseAttempt(tx,actor,enrollment.courseAttemptId,mode===\"history_read\",enrollment.id)");
   expect(canonical).toContain("attempt.classEnrollmentId!==expectedClassEnrollmentId");
   expect(learning).toContain('authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"history_read")');
   expect(learning).toContain('authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write")');
   expect(learning).toContain("learnerLessonProgress");
   expect(detail).toContain("NativeClassLessonContentPanel");
   expect(detail).not.toContain("restoredDemo");
 });
 it("preserves homework on one existing Course Attempt",()=>{
   expect(access).toContain('eq(canonicalClassEnrollments.status,"active")');
   expect(access).toContain('mode==="active_write"?query.for("update"):query');
   expect(homework).toContain('authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_read")');
   expect(homework).toContain('authorizeNativeLearnerClass(tx,actor,data.classEnrollmentId,"active_write")');
   expect(homework).toContain("public.graded_submissions");
   expect(homework).toContain('prior.status==="submitted"');
   expect(homework).toContain("ON CONFLICT (course_attempt_id,assignment_id) DO NOTHING");
   expect(detail).toContain("NativeClassHomeworkPanel");
 });
});
