import { describe, expect, it } from "vitest";
import { validateTeacherGradeInput } from "./teacher-grade-input";

const plain = { pointsPossible: "10", rubric: [], rubricInputs: {} };

describe("teacher grading preflight", () => {
  it.each(["", " ", "not-a-number", "-2", "10.01", "Infinity"])(
    "rejects missing or invalid numeric grades: %s", score => {
      expect(validateTeacherGradeInput({ ...plain, score }).valid).toBe(false);
    },
  );

  it("accepts boundaries and fractional scores without changing their value", () => {
    const zero = validateTeacherGradeInput({ ...plain, score: "0" });
    const partial = validateTeacherGradeInput({ ...plain, score: "8.5" });
    const full = validateTeacherGradeInput({ ...plain, score: "10" });
    expect(zero).toMatchObject({ valid: true, earned: 0, grading: { score: 0 } });
    expect(partial).toMatchObject({ valid: true, earned: 8.5, grading: { score: 8.5 } });
    expect(full).toMatchObject({ valid: true, earned: 10, grading: { score: 10 } });
  });

  const rubric = [
    { id: "reasoning", label: "Reasoning", maxPoints: 6 },
    { id: "evidence", label: "Evidence", maxPoints: 4 },
  ];

  it("requires exactly the authorized rubric criteria and uses the same scorer as the server", () => {
    expect(validateTeacherGradeInput({
      pointsPossible: "10", rubric, score: "999", rubricInputs: { reasoning: "5", evidence: "3.5" },
    })).toEqual({
      valid: true, earned: 8.5,
      grading: { rubricScores: [{ id: "reasoning", points: 5 }, { id: "evidence", points: 3.5 }] },
    });
    expect(validateTeacherGradeInput({
      pointsPossible: "10", rubric, score: "", rubricInputs: { reasoning: "5" },
    })).toMatchObject({ valid: false, message: expect.stringContaining("every rubric criterion") });
  });

  it("rejects rubric over-scoring and a rubric that does not match total points", () => {
    expect(validateTeacherGradeInput({
      pointsPossible: "10", rubric, score: "", rubricInputs: { reasoning: "7", evidence: "1" },
    })).toMatchObject({ valid: false, message: expect.stringContaining("Reasoning") });
    expect(validateTeacherGradeInput({
      pointsPossible: "12", rubric, score: "", rubricInputs: { reasoning: "4", evidence: "3" },
    })).toMatchObject({ valid: false, message: expect.stringContaining("do not match") });
  });

  it("rejects assessments with absent or invalid possible points", () => {
    expect(validateTeacherGradeInput({ ...plain, pointsPossible: null, score: "0" }).valid).toBe(false);
    expect(validateTeacherGradeInput({ ...plain, pointsPossible: "NaN", score: "0" }).valid).toBe(false);
  });
});
