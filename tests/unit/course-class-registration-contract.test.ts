import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Course → Class source consolidation contract",()=>{
  const command=source("src/modules/enrollment/noncredit-self-enrollment.functions.ts");
  const placement=source("src/modules/enrollment/course-class-placement.server.ts");
  const history=source("src/components/learning/NoncreditEnrollmentManagement.tsx");
  const migration=source("drizzle/0095_course_registration_class_placement.sql");
  it("registers exactly once, assigns a Class and shares the original attempt in one transaction",()=>{
    expect(command).toContain("const placement=alreadyEnrolled?null:await placeCourseRegistrationInClass(tx,");
    expect(placement).toContain(".set({classEnrollmentId:placed.id})");
    expect(placement).toContain("eq(learnerCourseAttempts.noncreditRegistrationId,args.registrationId)");
    expect(placement).toContain(".set({courseAttemptId:args.attemptId})");
    expect(placement).toContain('eventType:"ClassEnrollmentCreated"');
    expect(placement).not.toMatch(/tx\.insert\(learnerCourseAttempts\)/);
  });
  it("uses the exact published Course, Site, Person and validated Class authority",()=>{
    expect(placement).toContain("currentClassAuthority(tx,classId,new Date())");
    expect(placement).toContain("assertCurrentReviewedNativeLearner(link.canonicalAccountId,args.personId,new Date(),tx,true)");
    expect(placement).not.toContain("canonicalPersons");
    expect(placement).toContain("assertNativeClassSeatAvailable");
    expect(placement).toContain('eq(canonicalClassSessions.classId,cls.id)');
    expect(placement).toContain('eq(canonicalClassEnrollments.learnerPersonId,args.personId)');
    expect(placement).toContain("sourceAttributions.length!==1");
    expect(placement).toContain("classEnrollmentId:placed.id,releaseId:null,");
    expect(placement).toContain("releaseId:args.release.id,");
  });
  it("has one explicit database source exception with a strict provenance trigger",()=>{
    expect(migration).toContain("course_attempt_one_registration_with_optional_class_ck");
    expect(migration).toContain("public.validate_course_registration_class_placement()");
    expect(migration).toContain("r.participant_person_id=ce.learner_person_id");
    expect(migration).toContain("cls.site_id=release.site_id");
    expect(migration).toContain("NEW.course_version_id");
  });
  it("shows the Class in existing My Learning, not a second learning route",()=>{
    expect(history).toContain("course.classTitle");
    expect(history).toContain("Next Session:");
    expect(command).toContain("classId:canonicalClassEnrollments.classId");
  });
});
