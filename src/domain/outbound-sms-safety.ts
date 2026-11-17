/**
 * SMS provider calls are not idempotent in CAN's current Twilio transport.
 * A timeout, worker crash or missing response may conceal a successful send.
 * Never automatically resend an ambiguous SMS. Operator retry must also be
 * blocked until delivery reconciliation is implemented.
 */
export const SMS_PROVIDER_OUTCOME_UNCONFIRMED = "sms_provider_outcome_unconfirmed";

export type OutboundRecoveryState = {
  status: "pending" | "processing" | "accepted" | "failed" | "suppressed";
  nextAttemptAt: Date | null;
  acceptedAt: Date | null;
  leaseUntil: Date | null;
  lastError: string | null;
};

export function canRecoverTerminalDelivery(state: OutboundRecoveryState): boolean {
  return state.status === "failed" &&
    state.nextAttemptAt === null &&
    state.acceptedAt === null &&
    state.leaseUntil === null &&
    state.lastError !== SMS_PROVIDER_OUTCOME_UNCONFIRMED;
}

export function outboundAttemptOutcome(
  channel: string,
  result: { kind: "accepted" | "failed" | "suppressed";
    reason: string | null; nextAttemptAt: Date | null },
): { lastError: string | null; nextAttemptAt: Date | null } {
  if (channel === "sms" && result.kind === "failed") return {
    lastError: SMS_PROVIDER_OUTCOME_UNCONFIRMED,
    nextAttemptAt: null,
  };
  return { lastError: result.reason, nextAttemptAt: result.nextAttemptAt };
}
