import { describe, expect, it } from "vitest";
import { liveRubricTotal } from "./live-rubric-total";

describe("live rubric preview", () => {
  it("requires every criterion before calculating a total", () => {
    const rubric = [{ id: "clarity", label: "Clarity", maxPoints: 5 }];
    expect(liveRubricTotal(rubric, {})).toBeNull();
    expect(liveRubricTotal(rubric, { clarity: "" })).toBeNull();
    expect(liveRubricTotal(rubric, { clarity: "3" })).toBe(3);
    expect(liveRubricTotal(rubric, { clarity: "6" })).toBeNull();
    expect(liveRubricTotal(rubric, { clarity: "not-a-number" })).toBeNull();
  });
});
