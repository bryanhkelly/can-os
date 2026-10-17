import { describe, expect, it } from "vitest";
import { planTurn } from "@/platform/agent/planner";
describe("Ask CAN scheduled academic digests", () => {
  it("parses a weekly progress digest separately from assignment reminders", () => {
    expect(planTurn("Every Friday summarize Bobby's progress")).toMatchObject({
      intent: "manage", action: "create_digest", studentQuery: "Bobby", weekday: 5, hour: 19,
    });
  });
  it("preserves a normal assignment watch", () => {
    expect(planTurn("Tell me when Bobby misses an assignment")).toMatchObject({
      intent: "watch", studentQuery: "Bobby", eventTypes: ["AssignmentBecameMissing"],
    });
  });
});
