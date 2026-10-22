import { describe, expect, it } from "vitest";
import {
  STUDENT_LEARNING_GOAL_TYPE, studentLearningGoalActionText, teacherStudentGoalInput,
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
