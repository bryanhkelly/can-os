import { describe, expect, it } from "vitest";
import {
  SMS_PROVIDER_OUTCOME_UNCONFIRMED,
  canRecoverTerminalDelivery,
  outboundAttemptOutcome,
  type OutboundRecoveryState,
} from "@/domain/outbound-sms-safety";

const failed: OutboundRecoveryState = {
  status: "failed",
  nextAttemptAt: null,
  acceptedAt: null,
  leaseUntil: null,
  lastError: "provider_not_accepted",
};

describe("non-idempotent SMS transport safety", () => {
  it("forbids automatic retry after any ambiguous SMS provider outcome", () => {
    const nextAttemptAt = new Date("2026-11-17T20:00:00Z");
    expect(outboundAttemptOutcome("sms", {
      kind: "failed", reason: "delivery_worker_error", nextAttemptAt,
    })).toEqual({
      lastError: SMS_PROVIDER_OUTCOME_UNCONFIRMED,
      nextAttemptAt: null,
    });
    expect(outboundAttemptOutcome("sms", {
      kind: "accepted", reason: null, nextAttemptAt: null,
    })).toEqual({ lastError: null, nextAttemptAt: null });
  });

  it("continues idempotent email retries without conflating acceptance with delivery", () => {
    const nextAttemptAt = new Date("2026-11-17T20:00:00Z");
    expect(outboundAttemptOutcome("email", {
      kind: "failed", reason: "provider_not_accepted", nextAttemptAt,
    })).toEqual({ lastError: "provider_not_accepted", nextAttemptAt });
  });

  it("allows operator recovery only for terminal failed, unleased receipts", () => {
    expect(canRecoverTerminalDelivery(failed)).toBe(true);
    expect(canRecoverTerminalDelivery({
      ...failed, lastError: SMS_PROVIDER_OUTCOME_UNCONFIRMED,
    })).toBe(false);
    expect(canRecoverTerminalDelivery({
      ...failed, nextAttemptAt: new Date(),
    })).toBe(false);
    expect(canRecoverTerminalDelivery({
      ...failed, leaseUntil: new Date(),
    })).toBe(false);
    expect(canRecoverTerminalDelivery({
      ...failed, acceptedAt: new Date(),
    })).toBe(false);
    expect(canRecoverTerminalDelivery({
      ...failed, status: "suppressed",
    })).toBe(false);
  });
});
