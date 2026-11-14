import { describe, expect, it } from "vitest";
import { noncreditLabActions } from "@/domain/canonical-capability-lab";

const base = {
  courseStatus: "active",
  registrationStatus: "active",
  assessmentVersionId: "assessment",
  assessmentGrantStatus: null,
  assessmentAttemptId: null,
  assessmentAttemptState: null,
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
      assessmentAttemptState: "scored",
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
