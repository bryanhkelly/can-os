import { describe, expect, it } from "vitest";
import {
  STUDENT_LEARNING_GOAL_TYPE, studentLearningGoalActionText, teacherStudentGoalInput,
  studentGoalReviewInput, studentGoalOutcomeLabels, isStudentGoalPublicReview,
  statusFromTeacherGoalReview,
} from "@/domain/teacher-student-goal";
import {
  canCompleteStudentAction, isStudentSupportAction, isStudentVisibleSupportAction,
} from "@/modules/actions/student-action-policy";
import { deriveStudentSuccessSupportTasks } from "@/domain/student-success-support";

const valid = {
  teacherActionId: "11111111-1111-4111-8111-111111111111",
  title: "Practice fraction equations",
  studentInstructions: "Complete the next three fraction exercises and bring your work to class.",
  dueInDays: 7 as const,
  confirmedStudentSafe: true as const,
};

describe("teacher-approved student goals", () => {
  it("requires explicitly authored student-facing title and instructions", () => {
    expect(teacherStudentGoalInput.parse(valid)).toEqual(valid);
    expect(studentLearningGoalActionText(valid)).toEqual({
      title: valid.title, description: valid.studentInstructions,
    });
  });
  it("rejects attempts to carry private observations, automatic completion or staff IDs", () => {
    for (const extra of [
      { studentProfileId: valid.teacherActionId },
      { privateObservation: "Student counseling notes" },
      { autoNotifyGuardian: true }, { teacherEvidence: [{riskScore: 0.99}] },
      { status: "resolved" }, { ownerPersonId: valid.teacherActionId },
      { supportCaseId: valid.teacherActionId }, { sourceRole: "counselor" },
    ]) {
      expect(() => teacherStudentGoalInput.parse({ ...valid, ...extra })).toThrow();
    }
  });
  it("requires meaningful wording and a limited school follow-up horizon", () => {
    for (const bad of [
      { teacherActionId: "unverified" }, { title: "Help" },
      { studentInstructions: "Go study." }, { dueInDays: 0 },
      { dueInDays: 365 },
      { confirmedStudentSafe: false }, { studentInstructions: "x".repeat(751) },
    ]) {
      expect(() => teacherStudentGoalInput.parse({ ...valid, ...bad })).toThrow();
    }
  });
  it("shows the student task but does not let students resolve teacher-approved goals", () => {
    expect(STUDENT_LEARNING_GOAL_TYPE).toBe("student_learning_goal");
    expect(isStudentVisibleSupportAction(STUDENT_LEARNING_GOAL_TYPE)).toBe(true);
    expect(isStudentSupportAction(STUDENT_LEARNING_GOAL_TYPE)).toBe(false);
    expect(canCompleteStudentAction({type: STUDENT_LEARNING_GOAL_TYPE, status: "open"})).toBe(false);
    const derived = deriveStudentSuccessSupportTasks([
      {id: "goal-1", type: STUDENT_LEARNING_GOAL_TYPE, status:"open",
        title: "Practice fraction equations", dueAt: "2026-10-30T12:00:00Z",
        subjectType: "student_profile", subjectId:"student-1"},
      {id:"case",type:"academic_intervention",status:"open",
        title:"Private: student cannot read",dueAt:null,
        subjectType:"student_profile",subjectId:"student-1"},
    ]);
    expect(derived.tasks.map(t=>t.id)).toEqual(["goal-1"]);
    expect(JSON.stringify(derived)).not.toContain("Private:");
  });
});

describe("graded-evidence teacher review of student goals", () => {
  const review = {
    goalActionId: valid.teacherActionId,
    gradedSubmissionId: "22222222-2222-4222-8222-222222222222",
    outcome: "needs_more_practice" as const,
    studentFeedback: "The first three steps were correct. Revise the final solution and verify it by substitution.",
    confirmedStudentSafe: true as const,
  };
  it("requires a verified submission reference and human-selected outcome", () => {
    expect(studentGoalReviewInput.parse(review)).toEqual(review);
    expect(studentGoalOutcomeLabels.met).toContain("teacher reviewed");
    expect(statusFromTeacherGoalReview("met")).toBe("resolved");
    expect(statusFromTeacherGoalReview("needs_more_practice")).toBe("in_progress");
    expect(isStudentGoalPublicReview({
      outcome: "needs_more_practice", studentFeedback: review.studentFeedback,
      reviewedAt: "2026-10-22T23:00:00.000Z",
    })).toBe(true);
  });
  it("rejects invented grades, client authority, automatic mastery and unconfirmed disclosure", () => {
    for (const invalid of [
      { gradedSubmissionId: "not-verified" }, { outcome: "auto_certified" },
      { studentFeedback: "Good job." }, { confirmedStudentSafe: false },
      { studentProfileId: valid.teacherActionId }, { riskScore: 99 },
      { score: 100 }, { teacherPersonId: valid.teacherActionId },
      { counselingNote: "private" }, { attendance: "present" },
    ]) expect(() => studentGoalReviewInput.parse({ ...review, ...invalid })).toThrow();
  });
  it("refuses private or malformed stored output instead of treating it as student-visible", () => {
    expect(isStudentGoalPublicReview(null)).toBe(false);
    expect(isStudentGoalPublicReview({
      outcome: "met", studentFeedback: "private", reviewedAt: "2026-10-22T23:00:00Z",
    })).toBe(false);
    expect(isStudentGoalPublicReview({
      outcome: "met", studentFeedback: review.studentFeedback, reviewedAt: "not a date",
    })).toBe(false);
  });
});
