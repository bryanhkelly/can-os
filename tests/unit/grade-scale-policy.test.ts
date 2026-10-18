import { describe, expect, it } from "vitest";
import {
  FALLBACK_PASSING_GRADES,
  gradeLabelForPercentage,
  isPassingGrade,
  passingGradeLabels,
} from "@/domain/grade-scale-policy";

describe("passingGradeLabels", () => {
  it("uses explicit passing flags when any entry declares one", () => {
    const labels = passingGradeLabels({
      entries: [
        { label: "A", passing: true },
        { label: "B", passing: true },
        { label: "D", passing: false },
        { label: "F", passing: false },
      ],
    });
    expect(labels).toEqual(new Set(["A", "B"]));
  });

  it("treats every label as passing when no entry is flagged", () => {
    const labels = passingGradeLabels({
      entries: [{ label: "Excellent" }, { label: "Satisfactory" }],
    });
    expect(labels).toEqual(new Set(["Excellent", "Satisfactory"]));
  });

  it("passes nothing for a linked scale with an empty entry list", () => {
    expect(passingGradeLabels({ entries: [] })).toEqual(new Set());
  });

  it("returns null only when no scale is linked", () => {
    expect(passingGradeLabels(null)).toBeNull();
    expect(passingGradeLabels(undefined)).toBeNull();
    expect(() => passingGradeLabels({})).toThrow("Grade scale entries are required");
  });

  describe("gradeLabelForPercentage", () => {
    const bands = [
      { label: "A", minPercent: 90, maxPercent: 100 },
      { label: "B", minPercent: 80, maxPercent: 89.99 },
      { label: "F", minPercent: 0, maxPercent: 79.99 },
    ];

    it("uses configured labels and includes band endpoints", () => {
      expect(gradeLabelForPercentage(90, bands)).toBe("A");
      expect(gradeLabelForPercentage(89.99, bands)).toBe("B");
      expect(gradeLabelForPercentage(0, bands)).toBe("F");
    });

    it("assigns the top band to extra credit without hard-coded labels or entry order", () => {
      expect(gradeLabelForPercentage(125, [...bands].reverse())).toBe("A");
      expect(gradeLabelForPercentage(110, [{ label: "Mastered", minPercent: 0, maxPercent: 100 }])).toBe("Mastered");
    });

    it("rejects nonfinite grades, uncovered percentages, and invalid scales", () => {
      for (const percentage of [NaN, Infinity, -Infinity, -1, 89.995]) {
        expect(() => gradeLabelForPercentage(percentage, bands)).toThrow();
      }
      expect(() => gradeLabelForPercentage(50, [])).toThrow("no entries");
      expect(() => gradeLabelForPercentage(50, [{ label: "A", minPercent: 70, maxPercent: 60 }])).toThrow("invalid band");
      expect(() => gradeLabelForPercentage(110, [{ label: "A", minPercent: 0, maxPercent: 90 }])).toThrow("outside");
    });
  });
});

describe("isPassingGrade", () => {
  it("respects a scale that marks D as non-passing", () => {
    const scale = {
      entries: [
        { label: "A", passing: true },
        { label: "B", passing: true },
        { label: "C", passing: true },
        { label: "D", passing: false },
      ],
    };
    expect(isPassingGrade("C", scale)).toBe(true);
    expect(isPassingGrade("D", scale)).toBe(false);
  });

  it("supports custom scale labels", () => {
    const scale = { entries: [{ label: "Mastery" }, { label: "Developing" }] };
    expect(isPassingGrade("Mastery", scale)).toBe(true);
    expect(isPassingGrade("A", scale)).toBe(false);
  });

  it("falls back to the legacy list only when no scale is linked", () => {
    for (const grade of FALLBACK_PASSING_GRADES) {
      expect(isPassingGrade(grade, null)).toBe(true);
    }
    expect(isPassingGrade("F", null)).toBe(false);
    expect(isPassingGrade(null, null)).toBe(false);
    expect(isPassingGrade(undefined, undefined)).toBe(false);
  });
});
