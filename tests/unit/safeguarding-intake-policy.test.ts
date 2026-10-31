import { describe, expect, it } from "vitest";
import {
  safeguardingIntakeGuidance, safeguardingObservationSchema,
} from "@/domain/safeguarding-intake-policy";

const report = {
  siteId: "11111111-1111-4111-8111-111111111111",
  concernKinds: ["other_or_uncertain"] as Array<
    "other_or_uncertain" | "abuse_or_neglect" | "exploitation_or_coercion" |
    "substance_or_medical_safety" | "bullying_or_peer_harm" | "violence_or_threat" |
    "self_harm_or_welfare"
  >,
  source: "direct_observation" as const,
  immediateDanger: "unsure" as const,
  observedAt: "2026-10-22T17:00:00-05:00",
  factualObservation: "I observed a student become distressed during the afternoon session.",
};

describe("onsite safeguarding intake boundary (not a live reporter)", () => {
  it("accepts uncertain firsthand facts without inventing a crime, diagnosis or student identity", () => {
    expect(safeguardingObservationSchema.parse(report)).toEqual(report);
    const guidance = safeguardingIntakeGuidance(report);
    expect(guidance.requiresImmediateHumanReview).toBe(true);
    expect(guidance.outsideAgencyReportConfirmed).toBe(false);
    expect(guidance.neverAssumeGuardianIsSafeToNotify).toBe(true);
  });

  it("does not make suspected abuse a routine waiting-for-approval support ticket", () => {
    const guidance = safeguardingIntakeGuidance({
      ...report, concernKinds: ["abuse_or_neglect"], immediateDanger: "no",
    });
    expect(guidance.requiresImmediateHumanReview).toBe(true);
    expect(guidance.showDirectOutsideReportingInstructions).toBe(true);
    expect(guidance.note).toMatch(/without waiting for a school approval/);
    expect(guidance.outsideAgencyReportConfirmed).toBe(false);
  });

  it("puts life safety first, without treating all student welfare concerns as crimes", () => {
    const emergency = safeguardingIntakeGuidance({
      ...report, concernKinds: ["substance_or_medical_safety"], immediateDanger: "yes",
    });
    expect(emergency.showEmergencyHelpFirst).toBe(true);
    expect(emergency.showDirectOutsideReportingInstructions).toBe(false);
    const bullying = safeguardingIntakeGuidance({
      ...report, concernKinds: ["bullying_or_peer_harm"], immediateDanger: "no",
    });
    expect(bullying.showDirectOutsideReportingInstructions).toBe(false);
    expect(bullying.outsideAgencyReportConfirmed).toBe(false);
  });

  it("does not permit caller-injected roles, external-report confirmations or guardian notifications", () => {
    for (const extra of [
      { role: "safeguarding_lead" },
      { reportedToCps: true },
      { outsideAgencyReportConfirmed: true },
      { notifyGuardianAutomatically: true },
      { criminalFinding: "guilty" },
      { suspectedDiagnosis: "substance_use_disorder" },
      { reporterPersonId: report.siteId },
    ]) {
      expect(() => safeguardingObservationSchema.parse({ ...report, ...extra })).toThrow();
    }
  });

  it("rejects duplicate categories, unsupported claims and empty observations", () => {
    expect(() => safeguardingObservationSchema.parse({
      ...report, concernKinds: ["abuse_or_neglect", "abuse_or_neglect"],
    })).toThrow("Duplicate");
    expect(() => safeguardingObservationSchema.parse({
      ...report, factualObservation: "bad",
    })).toThrow();
    expect(() => safeguardingObservationSchema.parse({
      ...report, immediateDanger: "cleared_by_the_app",
    })).toThrow();
    expect(() => safeguardingObservationSchema.parse({
      ...report, concernKinds: ["confirmed_trafficking"],
    })).toThrow();
  });
});
