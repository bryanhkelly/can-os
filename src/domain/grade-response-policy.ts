/**
 * School-follow-up Actions are created only after a related guardian reviews
 * an already released grade. They are not an academic grade appeal or change.
 * The school owns the action; the guardian can read only their own response.
 */
export const gradeResponseActionType = "guardian_grade_follow_up" as const;

export function isGuardianGradeResponseAction(row: {
  type: string;
  subjectType: string;
  metadata: Record<string, unknown>;
}, actorPersonId: string, submissionId: string): boolean {
  return row.type === gradeResponseActionType &&
    row.subjectType === "student_profile" &&
    row.metadata.requestedByGuardianPersonId === actorPersonId &&
    row.metadata.submissionId === submissionId;
}

export function gradeResponseRequestedMessage(value: string): string {
  const message = value.trim();
  if (message.length < 10 || message.length > 1000)
    throw new Error("Follow-up message must be 10–1,000 characters");
  return message;
}
