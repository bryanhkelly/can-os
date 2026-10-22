import { describe, expect, it } from "vitest";
import {
  teacherLearningFollowUpInput, followUpApproachLabels,
  teacherFollowUpResolutionInput, teacherFollowUpResolutionNote,
} from "@/domain/teacher-learning-followup";

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

describe("teacher follow-up resolution", () => {
  const resolution = {
    actionId: valid.learningEventId,
    supportProvided: "Met with the student and reviewed their written equation solution.",
    outcome: "still_needs_support" as const,
    outcomeEvidence: "The student needs one more worked example and a review of their revised assignment.",
  };
  it("requires separately documented support and observed outcome", () => {
    expect(teacherFollowUpResolutionInput.parse(resolution)).toEqual(resolution);
    const note = teacherFollowUpResolutionNote(resolution);
    expect(note).toContain("Support provided: Met with the student");
    expect(note).toContain("Teacher-assessed outcome: Further support needed");
    expect(note).toContain("Evidence / next step: The student needs");
    expect(note).toMatch(/does not establish mastery or attendance/);
  });
  it("rejects client-injected state, inappropriate automatic judgments and empty details", () => {
    for (const invalid of [
      { supportProvided: "Spoke to them." },
      { supportProvided: "x".repeat(1001) },
      { outcomeEvidence: "Seemed better." },
      { outcome: "automatically_certified_mastery" },
      { actionId: "not-a-uuid" },
      { studentProfileId: valid.studentProfileId },
      { status: "resolved" },
      { guardianNotified: true },
    ]) {
      expect(() => teacherFollowUpResolutionInput.parse({ ...resolution, ...invalid })).toThrow();
    }
  });
});
