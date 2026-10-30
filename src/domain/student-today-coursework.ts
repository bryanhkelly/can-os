/**
 * Which latest-attempt coursework rows belong on Student Today. The query
 * selects each assessment's newest attempt first; this predicate then decides
 * what still needs the student's attention now.
 */
export function isCurrentCoursework(row: {
  submissionId: string | null;
  status: "assigned" | "submitted" | "graded" | "returned" | null;
  timeliness: string | null;
  dueAt: Date | null;
  submittedAt: Date | null;
}, dayStart: Date): boolean {
  return row.submissionId === null ||
    // Returned work always needs the student: a revision request past its due
    // date must never fall off the daily list just because it is no longer new.
    row.status === "returned" ||
    row.timeliness === "missing" ||
    (row.dueAt !== null && row.dueAt >= dayStart) ||
    (row.submittedAt !== null && row.submittedAt >= dayStart);
}
