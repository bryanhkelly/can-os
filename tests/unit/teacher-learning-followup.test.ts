import { describe, expect, it } from "vitest";
import { teacherLearningFollowUpInput, followUpApproachLabels } from "@/domain/teacher-learning-followup";

const valid = {
  sectionId: "11111111-1111-4111-8111-111111111111",
  studentProfileId: "22222222-2222-4222-8222-222222222222",
  learningEventId: "33333333-3333-4333-8333-333333333333",
  observation: "I will check the student's understanding of the assigned reading.",
  approach: "check_in" as const,
  dueInDays: 3 as const,
};

describe("teacher-reviewed learning follow-ups", () => {
  it("requires a specific human observation, a bounded follow-up and an evidence ID", () => {
    expect(teacherLearningFollowUpInput.parse(valid)).toEqual(valid);
    expect(followUpApproachLabels.check_in).toMatch(/Check in/);
    expect(teacherLearningFollowUpInput.parse({
      ...valid, observation: "  I will review the written work together.  ",
    }).observation).toBe("I will review the written work together.");
  });

  it("rejects automatic risk judgments, client-created privileges and undeclared actors", () => {
    for (const extra of [
      { role: "registrar" }, { riskScore: 99 }, { attendanceStatus: "absent" },
      { ownerPersonId: valid.studentProfileId }, { organizationId: valid.sectionId },
      { automaticallyNotifyGuardian: true }, { outcome: "resolved" },
    ]) {
      expect(() => teacherLearningFollowUpInput.parse({ ...valid, ...extra })).toThrow();
    }
  });

  it("rejects vague notes and unsupported deadlines/approaches", () => {
    for (const invalid of [
      { observation: "No activity." },
      { observation: "x".repeat(501) },
      { dueInDays: 0 }, { dueInDays: 30 },
      { approach: "automatic_risk_alert" },
      { learningEventId: "not-a-uuid" },
    ]) {
      expect(() => teacherLearningFollowUpInput.parse({ ...valid, ...invalid })).toThrow();
    }
  });
});
