/** Canonical student assignment destination. Legacy query links redirect here. */
export const studentAssignmentDetailRoute = "/student/assignments/$assessmentId" as const;

export type StudentAssignmentFilter =
  | "all" | "todo" | "missing" | "submitted" | "feedback";

/** For server-generated notification URLs that cannot render a React Link. */
export function studentAssignmentHref(assessmentId: string): string {
  return `/student/assignments/${encodeURIComponent(assessmentId)}`;
}
