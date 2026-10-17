import { describe, expect, it } from "vitest";
import { extractStudentQuery, planTurn } from "@/platform/agent/planner";

describe("deterministic agent planner: intent regression", () => {
  it.each([
    ["Tell me when Bobby misses an assignment", "Bobby"],
    ["Notify me if Bobby Smith misses homework", "Bobby Smith"],
    ["Keep an eye on Bobby's overdue coursework", "Bobby"],
    ["Watch Bobby for missing assignments", "Bobby"],
    ["Please alert me when María García has late homework", "María García"],
    ["Ping me if Bobby gets missing assignments", "Bobby"],
  ])("recognizes watches: %s", (input, student) => {
    const plan = planTurn(input);
    expect(plan).toMatchObject({
      intent: "watch", studentQuery: student,
      eventTypes: ["AssignmentBecameMissing"],
    });
  });

  it.each([
    ["How is Bobby doing?", "Bobby"],
    ["How's Bobby Smith doing in school?", "Bobby Smith"],
    ["Give me an update on Bobby Smith", "Bobby Smith"],
    ["Tell me about Bobby's progress", "Bobby"],
    ["Is Bobby doing well at school?", "Bobby"],
  ])("recognizes academic questions: %s", (input, name) => {
    expect(planTurn(input)).toMatchObject({
      intent: "ask", kind: "student_summary", studentQuery: name,
    });
  });

  it.each([
    ["What are you watching for me?", "list"],
    ["Show me my watches", "list"],
    ["Stop watching", "revoke"],
    ["Turn off that watch", "revoke"],
    ["Pause my watch", "pause"],
    ["Resume the watch", "resume"],
  ])("recognizes watch management: %s", (message, action) => {
    expect(planTurn(message)).toMatchObject({ intent: "manage", action });
  });

  it("parses bounded reminders", () => {
    expect(planTurn("Tell me when Bobby misses homework and remind me after 2 days"))
      .toMatchObject({ intent: "watch", remindAfterHours: 48 });
    expect(planTurn("Watch Bobby for overdue work and remind me every 4 hours"))
      .toMatchObject({ intent: "watch", remindAfterHours: 4 });
    expect(planTurn("Watch Bobby for overdue work and remind me after 999 days"))
      .not.toHaveProperty("remindAfterHours");
  });

  it.each([
    ["Tell me when my child misses homework"],
    ["Keep an eye on the students' missing assignments"],
    ["How is my son doing?"],
    ["How is anyone doing?"],
  ])("never invents a student from a vague reference: %s", input => {
    const plan = planTurn(input);
    if (plan.intent === "watch" || (plan.intent === "ask" && plan.kind === "student_summary")) {
      expect(plan.studentQuery).toBe("");
    }
  });

  it("does not create a watch for unrelated messages or an unsupported request", () => {
    expect(planTurn("Please email every parent their private records")).toEqual({
      intent: "ask", kind: "help",
    });
    expect(planTurn("Bobby is taking Biology")).toEqual({ intent: "ask", kind: "help" });
  });

  it("preserves multiword and accented student names", () => {
    expect(extractStudentQuery("How is Ana María doing?")).toBe("Ana María");
    expect(extractStudentQuery("Notify me if Jean-Luc Picard misses homework")).toBe("Jean-Luc Picard");
  });
});
