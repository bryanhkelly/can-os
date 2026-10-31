import { describe, expect, it } from "vitest";
import { adjacentReviews, prioritizeSubmittedReviews } from "./gradebook-review-queue";

describe("gradebook review queue", () => {
  const cells = [
    { submissionId: "a", status: "submitted", gradingDraft: null },
    { submissionId: "b", status: "graded", gradingDraft: { score: "5" } },
    { submissionId: "c", status: "submitted", gradingDraft: { score: "3" } },
    { submissionId: "d", status: "submitted", gradingDraft: null },
  ];

  it("shows only submitted work and prioritizes existing drafts without mutating input", () => {
    const result = prioritizeSubmittedReviews(cells);
    expect(result.map((cell) => cell.submissionId)).toEqual(["c", "a", "d"]);
    expect(cells.map((cell) => cell.submissionId)).toEqual(["a", "b", "c", "d"]);
  });

  it("provides adjacent reviews and no navigation for unknown submissions", () => {
    const queue = prioritizeSubmittedReviews(cells);
    expect(adjacentReviews(queue, "a")).toEqual({ previous: queue[0], next: queue[2] });
    expect(adjacentReviews(queue, "missing")).toEqual({ previous: undefined, next: undefined });
  });
});
