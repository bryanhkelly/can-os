/** Canonical student assignment destination. Legacy query links redirect here. */
export const studentAssignmentDetailRoute = "/student/assignments/$assessmentId" as const;

export type StudentAssignmentFilter =
  | "all" | "todo" | "missing" | "submitted" | "feedback";

/** For server-generated notification URLs that cannot render a React Link. */
export function studentAssignmentHref(assessmentId: string, options: {
  sectionId?: string | null;
  filter?: StudentAssignmentFilter;
} = {}): string {
  const search = new URLSearchParams();
  if (options.sectionId) search.set("section", options.sectionId);
  if (options.filter) search.set("filter", options.filter);
  const suffix = search.toString();
  return `/student/assignments/${encodeURIComponent(assessmentId)}${suffix ? `?${suffix}` : ""}`;
}
