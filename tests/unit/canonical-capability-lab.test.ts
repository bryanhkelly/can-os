import { describe, expect, it } from "vitest";
import { noncreditLabActions, selectNoncreditLabAssessmentEvidence } from "@/domain/canonical-capability-lab";

const base = {
  trainingState: "published",
  courseStatus: "active",
  registrationStatus: "active",
  assessmentVersionId: "assessment",
  assessmentGrantStatus: null,
  assessmentAttemptId: null,
  assessmentAttemptState: null,
  hasProvisionalResult: false,
  finalizedResultId: null,
  policyId: "policy",
  policyRequiresAssessment: true,
  latestDecision: null,
};

describe("noncredit Capability Lab action hints", () => {
  it("offers access provisioning for a published assessment, but not premature decisions", () => {
    expect(noncreditLabActions(base)).toEqual({
      provision: true, finalize: false, complete: false,
    });
  });
  it("offers provider finalization only for a scored attempt", () => {
    expect(noncreditLabActions({
      ...base, assessmentGrantStatus: "approved", assessmentAttemptId: "attempt",
      assessmentAttemptState: "scored", hasProvisionalResult: true,
    })).toEqual({ provision: false, finalize: true, complete: false });
  });
  it("offers a decision with a current policy and required finalized result", () => {
    expect(noncreditLabActions({
      ...base, assessmentGrantStatus: "approved", assessmentAttemptId: "attempt",
      assessmentAttemptState: "finalized", finalizedResultId: "final-result",
    })).toEqual({ provision: false, finalize: false, complete: true });
  });
  it("does not offer repeat completion or commands on inactive participation", () => {
    expect(noncreditLabActions({
      ...base, finalizedResultId: "result", latestDecision: "completed",
    }).complete).toBe(false);
    expect(noncreditLabActions({
      ...base, courseStatus: "withdrawn",
    })).toEqual({ provision: false, finalize: false, complete: false });
  });
});

describe("noncredit Lab assessment evidence selection", () => {
  const now = new Date("2026-11-14T16:00:00Z");
  const grant = (id: string, status = "approved", validFrom = "2026-11-01T00:00:00Z") => ({
    id, courseAttemptId: "course", status, validFrom: new Date(validFrom), validThrough: null,
  });
  const attempt = (id: string, grantId: string, state: string, createdAt: string) =>
    ({ id, grantId, state, createdAt: new Date(createdAt) });
  const result = (id: string, attemptId: string, status: string, revision: number,
    supersedesId: string | null = null) =>
    ({ id, attemptId, status, revision, outcome: "pass", supersedesId });

  it("uses only currently approved access and prioritizes a scored attempt with provisional results", () => {
    const snapshot = selectNoncreditLabAssessmentEvidence(
      [grant("revoked", "revoked", "2026-11-12T00:00:00Z"), grant("active")],
      [
        attempt("old", "revoked", "finalized", "2026-11-12T00:00:00Z"),
        attempt("newer", "active", "in_progress", "2026-11-11T00:00:00Z"),
        attempt("scored", "active", "scored", "2026-11-10T00:00:00Z"),
      ],
      [result("old-final", "old", "finalized", 2),
        result("provisional", "scored", "provisional", 1)],
      now,
    );
    expect(snapshot).toEqual({
      assessmentGrantStatus: "approved",
      assessmentAttemptId: "scored",
      assessmentAttemptState: "scored",
      hasProvisionalResult: true,
      finalizedResultId: null,
      finalizedOutcome: null,
    });
  });

  it("ignores superseded final results and cannot act through expired access", () => {
    const expired = { ...grant("expired"), validThrough: now };
    const snapshot = selectNoncreditLabAssessmentEvidence(
      [expired],
      [attempt("a", "expired", "finalized", "2026-11-10T00:00:00Z")],
      [result("final", "a", "finalized", 2),
       result("void", "a", "voided", 3, "final")],
      now,
    );
    expect(snapshot.assessmentGrantStatus).toBe("approved");
    expect(snapshot.assessmentAttemptId).toBeNull();
    expect(snapshot.finalizedResultId).toBeNull();
  });

  it("selects non-superseded finalized results across retries on valid access", () => {
    const snapshot = selectNoncreditLabAssessmentEvidence(
      [grant("valid")],
      [attempt("latest", "valid", "in_progress", "2026-11-13T00:00:00Z"),
        attempt("prior", "valid", "finalized", "2026-11-12T00:00:00Z")],
      [result("p", "prior", "provisional", 1),
       result("final", "prior", "finalized", 2, "p")],
      now,
    );
    expect(snapshot.assessmentAttemptId).toBe("latest");
    expect(snapshot.finalizedResultId).toBe("final");
    expect(snapshot.finalizedOutcome).toBe("pass");
    expect(snapshot.hasProvisionalResult).toBe(false);
  });

  it("never advertises provider finalization without a current provisional result", () => {
    expect(noncreditLabActions({
      ...base, assessmentGrantStatus: "approved",
      assessmentAttemptId: "scored-attempt",
      assessmentAttemptState: "scored", hasProvisionalResult: false,
    }).finalize).toBe(false);
    expect(noncreditLabActions({ ...base, trainingState: "draft" }).provision).toBe(false);
  });
});
