import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";

const plan = JSON.parse(readFileSync(
  new URL("../../curriculum/can-high-school-core/algebra1/week02-development-plan.json", import.meta.url),
  "utf8",
));

describe("Algebra I Week 2 publisher course plan", () => {
  it("is planning material, not a separate adopted unit or credit-ready course", () => {
    expect(plan.status).toBe("planning_only");
    expect(plan.creditStatus).toBe("not_credit_ready");
    expect(plan.releaseStatus).toBe("not_published");
    expect(plan.baseCourseVersion).toBe("publisher_owned_course_release");
    expect(plan.publicationPolicy).toMatch(/publisher|course release/i);
    expect(plan.publicationPolicy).not.toMatch(/adopt.{0,40}(unit|week)/i);
  });
  it("retains a complete five-day instructional outline and assessment plan", () => {
    expect(plan.plannedDays).toBe(5);
    expect(plan.dailyPlan).toHaveLength(5);
    expect(plan.dailyPlan.map((day: { day: number }) => day.day)).toEqual([1, 2, 3, 4, 5]);
    for (const day of plan.dailyPlan) {
      for (const field of ["topic", "target", "diagnostic", "workedModel", "guidedEvidence", "independentEvidence", "exitTicket"]) {
        expect(day[field]).toEqual(expect.any(String));
        expect(day[field].length).toBeGreaterThan(10);
      }
      expect(day.standards.length).toBeGreaterThan(0);
    }
    expect(plan.assessmentPlan.map((item: { pointsPossible: number }) => item.pointsPossible)).toEqual([20, 30]);
  });
  it("does not resurrect school-by-week adoption or a teacher unit approval gate", () => {
    const approvals = plan.teacherReviewChecklist.join(" ");
    expect(approvals).not.toMatch(/distinct unit release|pin it to the existing.*section|independently adopt/i);
    expect(approvals).toMatch(/publisher|course version/i);
  });
});
