/** Derived presentation ordering only; never changes submission state or authorization. */
export function prioritizeSubmittedReviews<T extends { status: string; gradingDraft?: unknown }>(
  cells: readonly T[],
): T[] {
  return cells
    .filter((cell) => cell.status === "submitted")
    .sort((a, b) => Number(Boolean(b.gradingDraft)) - Number(Boolean(a.gradingDraft)));
}

export function adjacentReviews<T extends { submissionId: string | null }>(
  queue: readonly T[],
  submissionId: string | null | undefined,
): { previous?: T; next?: T } {
  const index = queue.findIndex((cell) => cell.submissionId === submissionId);
  return {
    previous: index > 0 ? queue[index - 1] : undefined,
    next: index >= 0 ? queue[index + 1] : undefined,
  };
}
