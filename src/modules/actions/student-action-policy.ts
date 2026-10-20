export function isStudentSupportAction(type: string): boolean {
  return ["student_recovery", "student_support", "student_support_request", "conference_follow_up"].includes(type);
}

export function canCompleteStudentAction(action: { type: string; status: string }): boolean {
  return action.status === "open" && isStudentSupportAction(action.type);
}
