export function isStudentSupportAction(type: string): boolean {
  return ["student_recovery", "student_support", "student_support_request", "conference_follow_up"].includes(type);
}

export function canCompleteStudentAction(action: { type: string; status: string }): boolean {
  return action.status === "open" && isStudentSupportAction(action.type);
}

/**
 * Read-only, teacher-approved learning goals are student-visible, but must
 * NOT inherit student self-completion privileges from general support Actions.
 * Their outcome is reviewed in the teacher's owning workflow.
 */
export function isStudentVisibleSupportAction(type: string): boolean {
  return type === "student_learning_goal" || isStudentSupportAction(type);
}
