import { describe, expect, it } from "vitest";
import { familyInvitationProgress, familyInvitationRetryLabel } from "../../src/domain/family-invitation-progress";
const batch = { status: "retrying" as const, outboxStatus: "failed" as const,
  recipients: [{ status: "provider_accepted" as const }, { status: "retrying" as const }] };
describe("invitation delivery progress", () => {
  it("offers manual retry only after automatic processing is exhausted", () => {
    expect(familyInvitationProgress(batch).canRetry).toBe(true);
    for (const outboxStatus of ["pending", "processing", "processed", null] as const)
      expect(familyInvitationProgress({ ...batch, outboxStatus }).canRetry).toBe(false);
  });
  it("counts failures without including provider-accepted recipients", () => {
    expect(familyInvitationProgress(batch).failedRecipients).toBe(1);
    expect(familyInvitationProgress({ ...batch, recipients: [{ status: "responded" }] }).canRetry).toBe(false);
  });
  it("distinguishes a queued retry from a retry that needs staff action", () => {
    expect(familyInvitationProgress({ ...batch, outboxStatus: "pending" }).label).toBe("Retry queued.");
    expect(familyInvitationRetryLabel("pending")).toBe("Retry queued");
    expect(familyInvitationRetryLabel("processing")).toBe("Automatic retry in progress");
    expect(familyInvitationRetryLabel("failed")).toBe("Retry needed");
  });
  it("does not claim acceptance before the completion event finishes", () => {
    expect(familyInvitationProgress({ ...batch, status: "complete", outboxStatus: "processing" }).label)
      .not.toContain("All recipients accepted");
  });
  it("keeps provider acceptance separate from delivery", () => {
    expect(familyInvitationProgress({ ...batch, status: "complete", outboxStatus: "processed" }).label)
      .toContain("inbox delivery is not verified");
  });
  it("does not invent progress when the outbox event is missing", () => {
    expect(familyInvitationProgress({ ...batch, outboxStatus: null }).label).toContain("unavailable");
  });
});

