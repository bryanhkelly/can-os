/** A stable keyset cursor for bounded publisher-review candidate reads.
 * The caller must still enforce independent appointments and current versions
 * on every row. A page may contain zero visible reviews and still have more. */
export const nativeOfferingReviewPageSize = 60;
export type NativeOfferingReviewCursor = { createdAt: string; id: string };

export function pageNativeOfferingReviewCandidates<T extends { id: string; createdAt: Date }>(
  rows: readonly T[],
): { page: T[]; nextCursor: NativeOfferingReviewCursor | null } {
  const page = rows.slice(0, nativeOfferingReviewPageSize);
  const last = rows.length > nativeOfferingReviewPageSize ? page[page.length - 1] : null;
  return {
    page,
    nextCursor: last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null,
  };
}
