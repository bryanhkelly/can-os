/**
 * Bounded, source-owned native Class Enrollment history paging for My Activity.
 *
 * The callback must remain the existing WS2 reader, which enforces the
 * canonical learner Person and live grant for every page. This helper never
 * authorizes, reads or mutates an Enrollment by itself.
 */
export type NativeClassHistoryCursor = {
  enrolledAt: string;
  classEnrollmentId: string;
};
export type NativeClassHistoryPage<T> = {
  items: readonly T[];
  nextCursor: NativeClassHistoryCursor | null;
};

export async function readBoundedNativeClassHistory<T extends {classEnrollmentId: string}>(
  readPage: (cursor: NativeClassHistoryCursor | null) => Promise<NativeClassHistoryPage<T>>,
  maxPages = 10,
): Promise<{items: T[]; hasMore: boolean}> {
  if (!Number.isSafeInteger(maxPages) || maxPages < 1 || maxPages > 10)
    throw new Error("Native Class history pagination bound must be 1-10 pages");
  let cursor: NativeClassHistoryCursor | null = null;
  const seen = new Set<string>();
  const items: T[] = [];
  for (let n = 0; n < maxPages; n++) {
    const page = await readPage(cursor);
    // WS2 contracts a page of at most 50 source Enrollment rows.
    if (!Array.isArray(page.items) || page.items.length > 50)
      throw new Error("Invalid native Class history page");
    for (const row of page.items) {
      if (!row.classEnrollmentId || seen.has(row.classEnrollmentId))
        throw new Error("Duplicate or missing native Class Enrollment source ID");
      seen.add(row.classEnrollmentId);
      items.push(row);
    }
    if (!page.nextCursor) return {items, hasMore: false};
    if (page.items.length === 0 ||
        (cursor?.classEnrollmentId === page.nextCursor.classEnrollmentId &&
         cursor.enrolledAt === page.nextCursor.enrolledAt))
      throw new Error("Native Class history pagination did not advance");
    cursor = page.nextCursor;
  }
  return {items, hasMore: true};
}
