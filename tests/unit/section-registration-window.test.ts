import { describe, expect, it } from "vitest";
import { canAddStudentToSection } from "@/domain/section-registration-window";

describe("P0 enrollment placement's canonical local school date", () => {
  const baseline={
    addDropEndsOn:"2026-10-23",enrollmentCapacity:2,occupiedSeats:1,
    timezone:"America/Los_Angeles",
    now:new Date("2026-10-24T03:45:00.000Z"),
  };
  it("keeps an October 23 deadline open through the school's local day, not UTC", () => {
    expect(canAddStudentToSection(baseline)).toBe(true);
    expect(canAddStudentToSection({...baseline,timezone:"UTC"})).toBe(false);
    expect(canAddStudentToSection({...baseline,
      now:new Date("2026-10-24T07:00:00.000Z")})).toBe(false);
  });
  it("uses the same real occupied seats and capacity in preview and placement", () => {
    expect(canAddStudentToSection({...baseline,occupiedSeats:2})).toBe(false);
    expect(canAddStudentToSection({...baseline,occupiedSeats:3})).toBe(false);
    expect(canAddStudentToSection({...baseline,enrollmentCapacity:0})).toBe(false);
    expect(canAddStudentToSection({...baseline,occupiedSeats:-1})).toBe(false);
  });
  it("does not accept a malformed deadline instead of silently extending registration", () => {
    expect(canAddStudentToSection({...baseline,addDropEndsOn:""})).toBe(false);
    expect(canAddStudentToSection({...baseline,addDropEndsOn:"2026-99-99"})).toBe(false);
  });
});
