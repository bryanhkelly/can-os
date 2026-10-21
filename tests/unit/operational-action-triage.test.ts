import { describe, expect, it } from "vitest";
import { triageOperationalActions } from "@/domain/operational-action-triage";

const now = new Date("2030-01-10T12:00:00.000Z");
const action = (id: string, overrides: Partial<{
  dueAt: string | null; createdAt: string; ownerPersonId: string | null; priority: string; status: string;
}> = {}) => ({
  id, dueAt: null, createdAt: "2030-01-01T00:00:00.000Z", ownerPersonId: null,
  priority: "normal", status: "open", ...overrides,
});

describe("site operational action triage", () => {
  it("prioritizes overdue work before near-due, scheduled and undated actions", () => {
    const result = triageOperationalActions([
      action("undated", { priority: "urgent" }),
      action("upcoming", { dueAt: "2030-01-13T12:00:00.000Z" }),
      action("due-soon", { dueAt: "2030-01-11T12:00:00.000Z" }),
      action("overdue-normal", { dueAt: "2030-01-09T12:00:00.000Z" }),
      action("overdue-urgent", { dueAt: "2030-01-09T12:00:00.000Z", priority: "urgent" }),
    ], now);
    expect(result.items.map(item => [item.id, item.urgency])).toEqual([
      ["overdue-urgent", "overdue"], ["overdue-normal", "overdue"],
      ["due-soon", "due_soon"], ["upcoming", "upcoming"], ["undated", "unscheduled"],
    ]);
  });

  it("counts overdue, due within 24 hours and unassigned work without losing queue records", () => {
    const result = triageOperationalActions([
      action("overdue-unassigned", { dueAt: "2030-01-10T11:59:59.000Z" }),
      action("due-assigned", { dueAt: "2030-01-11T12:00:00.000Z", ownerPersonId: "person" }),
      action("just-outside", { dueAt: "2030-01-11T12:00:00.001Z" }),
      action("undated-unassigned"),
    ], now);
    expect(result.summary).toEqual({ overdue: 1, dueWithin24Hours: 1, unassigned: 3 });
    expect(result.items).toHaveLength(4);
  });

  it("fails explicitly for invalid dates", () => {
    expect(() => triageOperationalActions([action("bad", { dueAt: "not-a-date" })], now))
      .toThrow("Invalid operational action due date");
  });
});
