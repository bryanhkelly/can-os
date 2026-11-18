/** Pure student submission state checks shared by draft autosave and final submission.
 * File evidence is verified by the server; this only controls student affordances.
 */
export function canSubmitAssignmentWork(input: {
  responseText: string;
  queuedFiles: number;
  verifiedFiles: number;
}): boolean {
  return input.responseText.trim().length >= 3 ||
    input.queuedFiles > 0 ||
    input.verifiedFiles > 0;
}

/** Count the currently selected Section rather than counting hidden classes. */
export function assignmentSummaryForSection<T extends { sectionId: string | null; status: string | null }>(
  assignments: readonly T[], sectionId?: string,
): { assignments: T[]; total: number; awaitingFeedback: number; graded: number } {
  const scoped = assignments.filter(item => !sectionId || item.sectionId === sectionId);
  return {
    assignments: scoped,
    total: scoped.length,
    awaitingFeedback: scoped.filter(item => item.status === "submitted").length,
    graded: scoped.filter(item => item.status === "graded").length,
  };
}

/** Compare against the most recently confirmed save, not the initial loader.
 * Otherwise reverting an autosaved edit to the originally loaded value never
 * writes that reversal to the server.
 */
export function shouldAutosaveAssignmentDraft(input: {
  hydrated: boolean;
  editable: boolean;
  busy: boolean;
  draft: string;
  lastSaved: string;
}): boolean {
  return input.hydrated && input.editable && !input.busy &&
    input.draft !== input.lastSaved;
}
