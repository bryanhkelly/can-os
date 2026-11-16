import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const read=(path:string)=>readFileSync(path,"utf8");
describe("native Class reuses canonical assessment and survey engines",()=>{
  it("requires a real Class Course Attempt and independent provider-issued learner grant",()=>{
    const scope=read("src/modules/learning/native-class-assessment-scope.server.ts");
    const authorizer=read("src/modules/learning/canonical-course-participation.server.ts");
    expect(scope).toContain('access.source!=="class"');
    expect(scope).toContain("enrollment.courseAttemptId!==attempt.id");
    expect(scope).toContain("eq(canonicalClassEnrollments.learnerPersonId,context.actorPersonId)");
    expect(scope).toContain("eq(assessmentAccess.courseAttemptId,access.courseAttemptId)");
    expect(scope).toContain("eq(assessmentAccess.learnerId,profile.id)");
    expect(scope).not.toContain("tx.insert(noncreditRegistrations)");
    expect(authorizer).toContain('source:"class"');
  });
  it("uses the same canonical scoring/response service for noncredit and native Class",()=>{
    const server=read("src/modules/learning/noncredit-assessment.server.ts");
    expect(server).toContain('if(access.source==="class")');
    expect(server).toContain("loadNativeClassAssessmentScope(");
    expect(server).toContain("scoreNoncreditChoices(");
    expect(server).toContain("assessmentExecutionResponses");
    expect(server).toContain("assessmentExecutionResults");
    expect(server).toContain('scope.access.source==="noncredit" &&');
    expect(server).toContain("responseKind:version.responseKind");
    expect(server).not.toContain("scope.registration.learnerId");
  });
  it("reuses published, permissioned identified survey invitations for native Class",()=>{
    const source=read("src/modules/learning/course-surveys.functions.ts");
    expect(source).toContain('access.source!=="noncredit"&&access.source!=="class"');
    expect(source).toContain("eq(surveyInvitations.invitedPersonId,context.actorPersonId)");
    expect(source).toContain('eq(surveyCampaigns.responseMode,"identified")');
    expect(source).toContain("verifiedAt");
    expect(source).toContain("validateCourseSurveyAnswers(");
    expect(source).not.toContain("class_activity_submissions");
  });
  it("provisions canonical grants only to independently authorized Class members",()=>{
    const service=read("src/modules/classes/native-class-assessment-provision.functions.ts");
    for(const claim of [
      'assertCapability(actor,"class.manage")',
      'assertCapability(actor,"noncredit.assessment.provision")',
      "await validateClassAuthority(tx",
      "await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)",
      "eq(learnerCourseAttempts.classEnrollmentId,enrollment.id)",
      'isNull(learnerCourseAttempts.noncreditRegistrationId)',
      "await tx.insert(assessmentAccess)",
    ])expect(service).toContain(claim);
    expect(service).not.toContain("tx.insert(noncreditRegistrations)");
  });
  it("requires a different reviewer from learner and uses canonical result triggers",()=>{
    const review=read("src/modules/classes/native-class-assessment-finalize.functions.ts");
    expect(review).toContain("enrollment.learnerPersonId===actor.actorPersonId");
    expect(review).toContain('assertCapability(actor,"noncredit.assessment.finalize")');
    expect(review).toContain('assertCapability(actor,"class.manage")');
    expect(review).toContain("await assertCurrentCanonicalStaffForMutation(tx,getRequest(),actor)");
    expect(review).toContain("evaluateKnowledgeCheckResult(");
    expect(review).toContain("await tx.insert(assessmentExecutionResults)");
    expect(review).not.toContain("noncreditCompletionDecisions");
    expect(review).not.toContain("canonicalClassAwards");
  });
  it("does not recreate duplicate schema or learner-issued completions",()=>{
    const db=read("src/db/canonical-v301/classes.ts");
    const learner=read("src/components/learning/NativeClassCanonicalEvidencePanel.tsx");
    expect(db).not.toContain('table("course_activity_sets"');
    expect(db).not.toContain('table("class_activity_submissions"');
    expect(learner).toContain("CourseAssessmentPanel");
    expect(learner).toContain("NoncreditCourseSurveys");
    expect(learner).not.toContain("recordNativeClassCompletionEvidence");
  });
});
