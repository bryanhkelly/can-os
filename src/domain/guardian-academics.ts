/** Guardian-facing grades are released only after teacher grading. */
export function guardianFeedbackReleased(status: string | null): boolean {
 return status === "graded" || status === "returned";
}

/** Select the latest recorded attempt per assessment without leaking older drafts. */
export function latestGuardianAttempts<T extends { assessmentId: string; attemptNumber: number | null }>(rows: readonly T[]): T[] {
 const latest = new Map<string,T>();
 for (const row of rows) {
  const prior = latest.get(row.assessmentId);
  if (!prior || (row.attemptNumber ?? 0) > (prior.attemptNumber ?? 0))
   latest.set(row.assessmentId,row);
 }
 return [...latest.values()];
}

/** Once an attempted revision is saved, its own status is ungraded; only
 * earlier teacher-RELEASED feedback is shown as revision guidance.
 * Never project old scores as the student's current grade.
 */
export function priorReturnedGuardianFeedback<T extends {
 assessmentId: string; attemptNumber: number | null;
 submissionStatus: string | null;
}>(rows: readonly T[], latest: T): T | undefined {
 if(!["assigned","draft","submitted"].includes(latest.submissionStatus??""))
  return undefined;
 return rows.filter(row=>row.assessmentId===latest.assessmentId &&
  row.submissionStatus==="returned" &&
  (row.attemptNumber??0)<(latest.attemptNumber??0))
  .sort((a,b)=>(b.attemptNumber??0)-(a.attemptNumber??0))[0];
}

/** One definition of student work requiring action across guardian academics and family home. */
export function guardianWorkNeedsAction(status: string): boolean {
 return status === "assigned" || status === "returned" || status === "draft";
}

/** A returned attempt may need revision, but is not the same as never submitted. */
export function guardianAssignmentSummary(
 assignments: readonly {status:string;dueAt:string|null;score:string|null}[],
 now:Date,
) {
 // A draft created after a teacher returned an earlier attempt still
 // requires the learner to finish and resubmit; it is not completed work.
 const needsAction=assignments.filter(item=>guardianWorkNeedsAction(item.status));
 return {
  needsAction:needsAction.length,
  overdue:needsAction.filter(item=>item.dueAt!==null && !Number.isNaN(Date.parse(item.dueAt)) && Date.parse(item.dueAt)<now.getTime()).length,
  releasedGrades:assignments.filter(item=>item.score!==null).length,
 };
}

/** Links to already released attempt follow-ups, never draft grades or responses. */
export function releasedGuardianAttempts(rows: readonly {
 assessmentId: string; submissionId: string | null; attemptNumber: number | null;
 submissionStatus: string | null;
}[], assessmentId: string) {
 return rows.filter(row=>row.assessmentId===assessmentId && row.submissionId &&
   guardianFeedbackReleased(row.submissionStatus))
  .sort((a,b)=>(b.attemptNumber??0)-(a.attemptNumber??0))
  .map(row=>({submissionId:row.submissionId!,attemptNumber:row.attemptNumber??1}));
}
