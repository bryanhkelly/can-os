import { describe, expect, it } from "vitest";
import {
  nativeOfferingReviewPageSize, pageNativeOfferingReviewCandidates,
} from "../../src/domain/native-offering-review-page";

describe("native Offering reviewer candidate pagination", () => {
  it("returns a stable cursor after the final candidate in a full page", () => {
    const rows = Array.from({ length: nativeOfferingReviewPageSize + 1 }, (_, index) => ({
      id: String(nativeOfferingReviewPageSize - index).padStart(36, "0"),
      createdAt: new Date("2027-01-01T00:00:00.000Z"),
    }));
    const { page, nextCursor } = pageNativeOfferingReviewCandidates(rows);
    expect(page).toHaveLength(nativeOfferingReviewPageSize);
    expect(nextCursor).toEqual({
      createdAt: page[page.length - 1]!.createdAt.toISOString(),
      id: page[page.length - 1]!.id,
    });
  });
  it("does not manufacture an older page when there are no more candidates", () => {
    expect(pageNativeOfferingReviewCandidates([]).nextCursor).toBeNull();
    expect(pageNativeOfferingReviewCandidates([{
      id: "only", createdAt: new Date("2027-01-01T00:00:00.000Z"),
    }]).nextCursor).toBeNull();
  });
  it("keeps all candidates even when later appointment filtering finds none", () => {
    const rows = Array.from({ length: nativeOfferingReviewPageSize + 1 }, (_, index) => ({
      id: String(index), createdAt: new Date(1_700_000_000_000 - index * 1000),
    }));
    const { page, nextCursor } = pageNativeOfferingReviewCandidates(rows);
    expect(page).toHaveLength(nativeOfferingReviewPageSize);
    expect(nextCursor).not.toBeNull();
  });
});
