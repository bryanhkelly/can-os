import { describe, expect, it } from "vitest";
import {
  buildLaunchGuidance,
  launchOwnershipLabel,
  type LaunchGuidanceRecord,
} from "@/domain/launch-guidance";

function launch(overrides: Partial<LaunchGuidanceRecord> = {}): LaunchGuidanceRecord {
  return {
    id: "program",
    status: "launching",
    journey: { id: "journey", status: "in_progress" },
    requirements: [
      { id: "staff", key: "teacher-readiness", title: "Verify teachers", status: "needs_can", blocking: true },
      { id: "facility", key: "facility", title: "Review facility", status: "needs_you", blocking: true },
      { id: "orientation", key: "orientation", title: "Schedule orientation", status: "needs_you", blocking: false },
    ],
    ...overrides,
  };
}

describe("canonical launch guidance", () => {
  it("keeps school-actionable blocking work ahead of waiting and optional setup", () => {
    const guidance = buildLaunchGuidance(launch());
    expect(guidance.nextTask?.id).toBe("requirement:facility");
    expect(guidance.nextTask?.state).toBe("needs_you");
    expect(launchOwnershipLabel(guidance.nextTask!.state)).toBe("Needs you");
    expect(guidance.optionalSetupAvailable).toBe(false);
  });

  it("derives the resume point again from refreshed Journey records", () => {
    const before = buildLaunchGuidance(launch());
    const after = buildLaunchGuidance(launch({
      journey: { id: "journey", status: "in_progress" },
      requirements: launch().requirements.map(requirement =>
        requirement.id === "facility" ? { ...requirement, status: "complete" } : requirement),
    }));
    expect(before.nextTask?.id).toBe("requirement:facility");
    expect(after.nextTask?.id).toBe("requirement:staff");
    expect(after.nextTask?.state).toBe("needs_can");
  });

  it("maps third-party waiting to the requested human ownership label", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "license", key: "license", title: "External license", status: "waiting_third_party", blocking: true }],
    }));
    expect(guidance.nextTask?.state).toBe("waiting_third_party");
    expect(launchOwnershipLabel(guidance.nextTask!.state)).toBe("Waiting on someone else");
  });

  it("does not treat checked requirements as opening permission without a ready Journey", () => {
    const guidance = buildLaunchGuidance(launch({
      journey: { id: "journey", status: "in_progress" },
      requirements: [{ id: "school", key: "school-readiness", title: "School review", status: "complete", blocking: true }],
    }));
    expect(guidance.pendingBlocking).toHaveLength(0);
    expect(guidance.ready).toBe(false);
    expect(guidance.tasks.find(task => task.id === "opening")?.state).toBe("blocked");
    expect(guidance.nextTask?.id).not.toBe("opening");
  });

  it("does not open while any blocking requirement remains, even if Journey status is stale", () => {
    const guidance = buildLaunchGuidance(launch({ journey: { id: "journey", status: "ready" } }));
    expect(guidance.ready).toBe(false);
    expect(guidance.nextTask?.id).toBe("requirement:facility");
    expect(guidance.tasks.find(task => task.id === "opening")?.state).toBe("blocked");
  });

  it("offers opening only from a ready Journey, ahead of nonblocking orientation", () => {
    const guidance = buildLaunchGuidance(launch({
      journey: { id: "journey", status: "ready" },
      requirements: launch().requirements.map(requirement => requirement.blocking
        ? { ...requirement, status: "complete" }
        : requirement),
    }));
    expect(guidance.ready).toBe(true);
    expect(guidance.nextTask?.id).toBe("opening");
    expect(guidance.optionalSetupAvailable).toBe(true);
  });

  it("shows canonical document-review correction text", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "review", key: "safety-review", title: "Safety review", status: "needs_you",
        blocking: true, evidence: [{ kind: "document_review", status: "rejected",
          text: "Provide the signed safety plan.", reviewedAt: "2026-10-30T10:00:00Z" }] }],
    }));
    expect(guidance.nextTask?.latestReviewReason).toBe("Provide the signed safety plan.");
    expect(guidance.nextTask?.latestReviewStatus).toBe("rejected");
    expect(guidance.nextTask?.requiresRegistrarReview).toBe(true);
  });

  it("uses review timestamps rather than evidence array order", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "review", key: "safety-review", title: "Safety review", status: "needs_you",
        blocking: true, evidence: [
          { kind: "document_review", status: "accepted", reviewedAt: "2026-10-30T12:00:00Z" },
          { kind: "document_review", status: "rejected", text: "Old rejection", reviewedAt: "2026-10-29T12:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.latestReviewStatus).toBe("accepted");
    expect(guidance.nextTask?.latestReviewReason).toBeNull();
  });

  it("does not infer an approved requirement from an accepted evidence event", () => {
    const guidance = buildLaunchGuidance(launch({
      journey: { id: "journey", status: "ready" },
      requirements: [{ id: "review", key: "safety-review", title: "Safety review",
        status: "needs_can", blocking: true, metadata: { evidenceReviewRequired: true },
        evidence: [{ kind: "document_review", status: "accepted", reviewedAt: "2026-10-30T12:00:00Z" }] }],
    }));
    expect(guidance.ready).toBe(false);
    expect(guidance.pendingBlocking).toHaveLength(1);
    expect(guidance.nextTask?.requiresRegistrarReview).toBe(true);
  });

  it("counts submitted statements without changing requirement readiness", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "evidence", key: "safety", title: "Safety evidence", blocking: true,
        status: "needs_can", evidence: [
          { kind: "launch_evidence_statement", text: "Safety plan prepared", submittedAt: "2026-10-30T10:00:00Z" },
          { kind: "launch_evidence_statement", text: "Updated plan", submittedAt: "2026-10-30T11:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.evidenceStatementCount).toBe(2);
    expect(guidance.nextTask?.latestEvidenceStatementAt).toBe("2026-10-30T11:00:00Z");
    expect(guidance.ready).toBe(false);
  });

  it("surfaces institutional launch rejection and keeps the school closed", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "safety", key: "safety", title: "Safety", status: "needs_you",
        blocking: true, evidence: [
          { kind: "launch_evidence_statement", text: "Plan submitted", submittedAt: "2026-10-30T10:00:00Z" },
          { kind: "launch_evidence_review", status: "rejected", text: "Missing signatures",
            reviewedAt: "2026-10-30T11:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.latestReviewStatus).toBe("rejected");
    expect(guidance.nextTask?.latestReviewReason).toBe("Missing signatures");
    expect(guidance.nextTask?.requiresRegistrarReview).toBe(true);
    expect(guidance.ready).toBe(false);
  });

  it("identifies a pending institutional evidence decision", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "review", key: "safety", title: "Safety", status: "needs_can",
        blocking: true, evidence: [
          { kind: "launch_evidence_statement", text: "Safety plan uploaded", submittedAt: "2026-10-30T10:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.pendingEvidenceReview).toBe(true);
    expect(guidance.ready).toBe(false);
  });

  it("requires a new submission after an institutional rejection", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "review", key: "safety", title: "Safety", status: "needs_can",
        blocking: true, metadata: { evidenceReviewRequired: true }, evidence: [
          { kind: "launch_evidence_statement", text: "First plan", submittedAt: "2026-10-30T10:00:00Z" },
          { kind: "launch_evidence_review", status: "rejected", text: "Missing signature",
            reviewedAt: "2026-10-30T11:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.pendingEvidenceReview).toBe(false);
    expect(guidance.nextTask?.evidenceReviewCorrectionPending).toBe(true);
    expect(guidance.ready).toBe(false);
  });

  it("returns a corrected submission to the institutional review queue", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "review", key: "safety", title: "Safety", status: "needs_can",
        blocking: true, metadata: { evidenceReviewRequired: true }, evidence: [
          { kind: "launch_evidence_statement", text: "First plan", submittedAt: "2026-10-30T10:00:00Z" },
          { kind: "launch_evidence_review", status: "rejected", text: "Missing signature",
            reviewedAt: "2026-10-30T11:00:00Z" },
          { kind: "launch_evidence_statement", text: "Signed plan", submittedAt: "2026-10-30T12:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.pendingEvidenceReview).toBe(true);
    expect(guidance.nextTask?.evidenceReviewCorrectionPending).toBe(false);
    expect(guidance.nextTask?.latestEvidenceStatement).toBe("Signed plan");
    expect(guidance.ready).toBe(false);
  });

  it("does not route ordinary school evidence into institutional review", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "school", key: "room-setup", title: "Room setup", status: "needs_you",
        blocking: true, evidence: [
          { kind: "launch_evidence_statement", text: "Classroom arranged", submittedAt: "2026-10-30T10:00:00Z" },
        ] }],
    }));
    expect(guidance.nextTask?.pendingEvidenceReview).toBe(false);
    expect(guidance.ready).toBe(false);
  });

  it("does not retain pending review after institutional acceptance", () => {
    const guidance = buildLaunchGuidance(launch({
      journey: { id: "journey", status: "ready" },
      requirements: [{ id: "review", key: "safety", title: "Safety", status: "complete",
        blocking: true, metadata: { evidenceReviewRequired: true }, evidence: [
          { kind: "launch_evidence_statement", text: "Signed plan", submittedAt: "2026-10-30T12:00:00Z" },
          { kind: "launch_evidence_review", status: "accepted", reviewedAt: "2026-10-30T13:00:00Z" },
        ] }],
    }));
    const requirement = guidance.tasks.find(task => task.requirementId === "review");
    expect(requirement?.pendingEvidenceReview).toBe(false);
    expect(requirement?.evidenceReviewCorrectionPending).toBe(false);
    expect(requirement?.state).toBe("complete");
    expect(guidance.ready).toBe(true);
  });

  it("keeps enrollment-form review in its dedicated admissions workflow", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "enrollment", key: "enrollment-form", title: "Enrollment form",
        status: "needs_can", blocking: true, metadata: { enrollmentForm: { title: "Application" }, evidenceReviewRequired: true },
        evidence: [{ kind: "launch_evidence_statement", text: "Application attached", submittedAt: "2026-10-30T10:00:00Z" }] }],
    }));
    expect(guidance.nextTask?.pendingEvidenceReview).toBe(false);
    expect(guidance.nextTask?.requiresRegistrarReview).toBe(true);
    expect(guidance.ready).toBe(false);
  });

  it("fails closed for an unrecognized persisted requirement state", () => {
    const guidance = buildLaunchGuidance(launch({
      requirements: [{ id: "unknown", key: "other", title: "Other", status: "unexpected", blocking: true }],
    }));
    expect(guidance.nextTask?.state).toBe("blocked");
    expect(guidance.ready).toBe(false);
  });
});
