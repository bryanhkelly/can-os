import { describe, expect, it } from "vitest";
import { assessmentAvailability } from "@/domain/assessment-availability";
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
