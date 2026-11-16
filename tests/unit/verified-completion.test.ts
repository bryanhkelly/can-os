import { describe, expect, it } from "vitest";
import {
  evaluateAwardAuthority, evaluateCourseCompletion, evaluateProgramCompletion,
  type CanonicalAssessmentResult, type CompletionScope,
  type PublishedCompletionPolicy, type VerifiedSessionEvidence,
} from "@/domain/verified-completion";

const learner = "learner-1";
const scope: CompletionScope = {
  participantPersonId: learner, courseAttemptId: "attempt-1",
  courseVersionId: "course-v1", classEnrollmentId: "enrollment-1",
};
const now = new Date("2026-11-16T15:00:00Z");
const policy: PublishedCompletionPolicy = {
  id: "policy-v1", courseVersionId: scope.courseVersionId, published: true,
  authorPersonId: "author-1", approvedByPersonId: "reviewer-1",
  effectiveAt: new Date("2026-11-01T00:00:00Z"),
  requireAllLessons: true, requiredVerifiedSessions: 2, requirePassingAssessment: true,
};
const attendance = (id: string, sessionId: string): VerifiedSessionEvidence => ({
  id, sessionId, courseAttemptId: scope.courseAttemptId,
  participantPersonId: learner, evidenceVersionId: `evidence-${id}`,
  verifiedByPersonId: "attendance-reviewer",
  verifiedAt: new Date("2026-11-16T14:00:00Z"),
  occurredAt: new Date("2026-11-15T18:00:00Z"), supersedesId: null,
});
const result = (overrides: Partial<CanonicalAssessmentResult> = {}): CanonicalAssessmentResult => ({
  id: "result-1", courseAttemptId: scope.courseAttemptId,
  courseVersionId: scope.courseVersionId, participantPersonId: learner,
  attemptState: "finalized", resultStatus: "finalized", outcome: "pass",
  reviewedByPersonId: "assessment-reviewer", supersedesId: null, ...overrides,
});
const base = () => ({
  scope, participationStatus: "active", pinnedPolicyId: policy.id,
  policy, allLessonIds: ["a","b"], completedLessonIds: ["a","b"],
  sessionEvidence: [attendance("one","session-1"),attendance("two","session-2")],
  assessmentResults: [result()], now,
});

describe("WS3 canonical Course / native Class completion readiness", () => {
  it("requires independent review even after everything is verified", () => {
    expect(evaluateCourseCompletion(base())).toMatchObject({
      readyForIndependentReview: true, verifiedCompletion: false,
      blockers: [], verifiedSessions: 2, completedLessons: 2,
    });
  });
  it("blocks an absent, unpublished, or unpinned policy", () => {
    expect(evaluateCourseCompletion({...base(),policy:null}).blockers)
      .toContain("policy_unavailable");
    expect(evaluateCourseCompletion({...base(),pinnedPolicyId:"policy-v2"}).blockers)
      .toContain("policy_not_pinned");
    expect(evaluateCourseCompletion({...base(),policy:{...policy,published:false}}).blockers)
      .toContain("policy_unavailable");
    expect(evaluateCourseCompletion({...base(),policy:{...policy,approvedByPersonId:policy.authorPersonId}}).blockers)
      .toContain("policy_unavailable");
    expect(evaluateCourseCompletion({...base(),policy:{...policy,approvedByPersonId:learner}}).blockers)
      .toContain("policy_unavailable");
  });
  it("does not complete a withdrawn learner or from lesson progress alone", () => {
    expect(evaluateCourseCompletion({...base(),participationStatus:"withdrawn"}).blockers)
      .toContain("inactive_participation");
    expect(evaluateCourseCompletion({...base(),sessionEvidence:[],assessmentResults:[]}).blockers)
      .toEqual(expect.arrayContaining(["attendance_unverified","assessment_not_passed"]));
  });
  it("rejects incomplete lessons and zero-lesson shortcuts", () => {
    expect(evaluateCourseCompletion({...base(),completedLessonIds:["a"]}).blockers)
      .toContain("lessons_incomplete");
    expect(evaluateCourseCompletion({...base(),allLessonIds:[],completedLessonIds:[]}).blockers)
      .toContain("lessons_incomplete");
  });
  it("counts distinct, independently verified sessions, not devices or duplicates", () => {
    const same = [attendance("one","s1"),attendance("two","s1")];
    expect(evaluateCourseCompletion({...base(),sessionEvidence:same}).verifiedSessions).toBe(1);
    expect(evaluateCourseCompletion({...base(),sessionEvidence:same}).blockers)
      .toContain("attendance_unverified");
    expect(evaluateCourseCompletion({...base(),sessionEvidence:[
      attendance("one","s1"),{...attendance("two","s2"),verifiedByPersonId:learner},
    ]}).blockers).toContain("attendance_unverified");
    expect(evaluateCourseCompletion({...base(),sessionEvidence:[
      attendance("one","s1"),{...attendance("two","s2"),verifiedAt:null},
    ]}).blockers).toContain("attendance_unverified");
    expect(evaluateCourseCompletion({...base(),sessionEvidence:[
      attendance("one","s1"),{...attendance("two","s2"),participantPersonId:"other"},
    ]}).blockers).toContain("attendance_unverified");
  });
  it("ignores superseded attendance evidence", () => {
    const replacement = {...attendance("two","session-2"),supersedesId:"one"};
    expect(evaluateCourseCompletion({...base(),sessionEvidence:[
      attendance("one","session-1"),replacement,
    ]}).blockers).toContain("attendance_unverified");
  });
  it("requires finalized passing results bound to the actual Course Attempt", () => {
    for (const overrides of [
      {outcome:"fail"},{resultStatus:"provisional"},{attemptState:"scored"},
      {reviewedByPersonId:null},{reviewedByPersonId:learner},
      {participantPersonId:"other"},{courseAttemptId:"wrong"},
      {courseVersionId:"wrong"},
    ]) {
      expect(evaluateCourseCompletion({...base(),assessmentResults:[result(overrides)]}).blockers)
        .toContain("assessment_not_passed");
    }
  });
  it("cannot count superseded passing results", () => {
    const revised = result({id:"result-2",outcome:"fail",supersedesId:"result-1"});
    expect(evaluateCourseCompletion({...base(),assessmentResults:[result(),revised]}).blockers)
      .toContain("assessment_not_passed");
  });
  it("requires some nontrivial approved criteria, not an empty policy", () => {
    expect(evaluateCourseCompletion({...base(),policy:{
      ...policy,requireAllLessons:false,requiredVerifiedSessions:0,requirePassingAssessment:false,
    }}).blockers).toContain("policy_unavailable");
  });
});

describe("WS3 Program component aggregation", () => {
  const requirements=[{componentKey:"course-a",required:true},{componentKey:"course-b",required:true}];
  const first={componentKey:"course-a",sourceKind:"class_outcome" as const,
    sourceId:"a",participantPersonId:learner,final:true,completed:true,revoked:false};
  const second={...first,componentKey:"course-b",sourceKind:"noncredit_completion_decision" as const,sourceId:"b"};
  it("reuses two verified component decisions without duplicating underlying evidence",()=>{
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[first,second]}))
      .toMatchObject({readyForReview:true,missing:[],conflicting:[]});
  });
  it("rejects missing, revoked, or another learner's components",()=>{
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[first]}).missing)
      .toEqual(["course-b"]);
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[first,{...second,revoked:true}]}).readyForReview)
      .toBe(false);
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[first,{...second,participantPersonId:"other"}]}).readyForReview)
      .toBe(false);
  });
  it("does not double count the same authoritative source for two components",()=>{
    const duplicate={...second,sourceKind:first.sourceKind,sourceId:first.sourceId};
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[first,duplicate]}).readyForReview)
      .toBe(false);
  });
  it("does not consider duplicate conflicting revisions final",()=>{
    expect(evaluateProgramCompletion({participantPersonId:learner,requirements,decisions:[
      first,second,{...second,sourceId:"old",completed:false},
    ]}).readyForReview).toBe(false);
  });
});

describe("WS3 award separation",()=>{
  const baseAward={
    learnerPersonId:learner,issuerPersonId:"issuer-1",
    issuerOrganizationId:"org-1",operatingOrganizationId:"org-1",
    currentIndependentIssuerApproval:true,
    approvedPolicyEvidenceVersionId:"policy-evidence-1",
    verifiedCompletionDecisionId:"decision-1",
    enrollmentCreditMode:"not_applicable" as const,
    awardKind:"certificate" as const,academicIssuerApproved:false,
  };
  it("allows eligibility assessment only after independent authorization",()=>{
    expect(evaluateAwardAuthority(baseAward)).toEqual({allowed:true,reasons:[]});
    expect(evaluateAwardAuthority({...baseAward,issuerPersonId:learner}).allowed).toBe(false);
    expect(evaluateAwardAuthority({...baseAward,currentIndependentIssuerApproval:false}).allowed).toBe(false);
    expect(evaluateAwardAuthority({...baseAward,verifiedCompletionDecisionId:null}).allowed).toBe(false);
  });
  it("never derives academic credit from enrollment intent",()=>{
    expect(evaluateAwardAuthority({...baseAward,awardKind:"academic_credit",
      enrollmentCreditMode:"for_credit",academicIssuerApproved:false}).reasons)
      .toContain("academic_credit_not_authorized");
    expect(evaluateAwardAuthority({...baseAward,awardKind:"academic_credit",
      enrollmentCreditMode:"audit",academicIssuerApproved:true}).allowed).toBe(false);
  });
});
