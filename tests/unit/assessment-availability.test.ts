import { describe, expect, it } from "vitest";
import { assessmentAvailability, isStudentAssessmentVisible } from "@/domain/assessment-availability";
const now = new Date("2026-10-29T12:00:00Z");
const open = { status: "published", availableAt: null, closesAt: null };
describe("assessment availability", () => {
  it("allows published work without a close regardless of its due date", () => {
    expect(assessmentAvailability(open, now).actionable).toBe(true);
  });
  it("excludes future release and explicit closed status", () => {
    expect(assessmentAvailability({ ...open, availableAt: new Date(now.getTime()+1) }, now).actionable).toBe(false);
    expect(assessmentAvailability({ ...open, status: "closed" }, now).actionable).toBe(false);
  });
  it("closes exactly at the close boundary", () => {
    expect(assessmentAvailability({ ...open, closesAt: now }, now).actionable).toBe(false);
    expect(assessmentAvailability({ ...open, closesAt: new Date(now.getTime()+1) }, now).actionable).toBe(true);
  });
});

describe("student assessment release visibility", () => {
  it("keeps unreleased work off both student-facing views", () => {
    expect(isStudentAssessmentVisible({ status: "published", availableAt: new Date(now.getTime() + 1) }, now)).toBe(false);
    expect(isStudentAssessmentVisible({ status: "published", availableAt: now }, now)).toBe(true);
    expect(isStudentAssessmentVisible({ status: "draft", availableAt: null }, now)).toBe(false);
  });
  it("keeps past released closed assessments visible in assignment history, not actionable", () => {
    const closed = { status: "closed", availableAt: new Date(now.getTime() - 1), closesAt: null };
    expect(isStudentAssessmentVisible(closed, now)).toBe(true);
    expect(assessmentAvailability(closed, now).actionable).toBe(false);
    expect(isStudentAssessmentVisible({ ...closed, availableAt: new Date(now.getTime() + 1) }, now)).toBe(false);
  });
});
