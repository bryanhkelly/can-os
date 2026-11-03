import { describe, expect, it } from "vitest";
import { deliveryOutcome } from "@/domain/delivery-outcome";

describe("safe delivery explanations and next actor", () => {
  const failed = { status: "failed", channel: "sms", lastError: null, nextAttemptAt: null } as const;
  it("keeps SMS verification and consent explicit without promising a resend", () => {
    const outcome = deliveryOutcome({ ...failed, lastError: "sms_consent_required" });
    expect(outcome.recovery).toBe("preferences");
    expect(outcome.nextStep).toContain("explicitly opt in");
    expect(outcome.nextStep).toContain("does not resend");
  });
  it("directs account-email repair to school support rather than claiming a retry repairs identity", () => {
    const outcome = deliveryOutcome({ ...failed, channel: "email", lastError: "no_active_email", nextAttemptAt: new Date() });
    expect(outcome.label).toBe("Retry scheduled");
    expect(outcome.nextStep).toContain("school support");
    expect(outcome.recovery).toBeNull();
  });
  it("identifies the worker for automatic retry and support for terminal failures", () => {
    expect(deliveryOutcome({ ...failed, nextAttemptAt: new Date() }).nextStep).toContain("worker will retry");
    expect(deliveryOutcome(failed).nextStep).toContain("No automatic retry");
  });
  it("never exposes provider diagnostic strings", () => {
    for (const status of ["failed", "suppressed"] as const) {
      expect(JSON.stringify(deliveryOutcome({ ...failed, status, lastError: "private provider diagnostic" })))
        .not.toContain("private provider diagnostic");
    }
  });
  it("does not suggest restoring access by enabling a watch", () => {
    const outcome = deliveryOutcome({ ...failed, status: "suppressed", lastError: "authorization_failed" });
    expect(outcome.recovery).toBeNull();
    expect(outcome.nextStep).toContain("cannot restore record permissions");
  });
  it("preserves resolved conditions and gives inactive watches a future-settings path", () => {
    expect(deliveryOutcome({ ...failed, status: "suppressed", lastError: "condition_resolved" }).nextStep).toContain("No resend");
    expect(deliveryOutcome({ ...failed, status: "suppressed", lastError: "watch_inactive" }).recovery).toBe("watches");
    expect(deliveryOutcome({ ...failed, lastError: "channel_not_supported" }).recovery).toBe("watches");
  });
  it("does not equate provider acceptance or in-app creation with reading", () => {
    expect(deliveryOutcome({ ...failed, status: "delivered" }).detail).toContain("reading are not verified");
    expect(deliveryOutcome({ ...failed, status: "delivered", channel: "in_app" }).detail).toContain("does not mean it has been read");
    expect(deliveryOutcome({ ...failed, status: "pending" }).nextStep).toContain("worker acts next");
    expect(deliveryOutcome({ ...failed, status: "processing" }).nextStep).toContain("does not start another send");
  });
});
