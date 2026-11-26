import {
  OUTBOUND_LEASE_MS,
  OUTBOUND_MAX_ATTEMPTS,
  outboundRetryDelayMs,
} from "@/domain/outbound-retry-policy";

/**
 * Transport-only orchestration for source-owned, durable outbound queues.
 *
 * The source adapter owns SQL row locking, lease fencing, eligibility,
 * message construction, recipient authorization and final state writes.
 * Never send within the source command transaction. A provider's acceptance
 * is not proof of inbox delivery.
 */
export type OutboundClaim = {
  id: string;
  leaseUntil: Date;
  attempts: number;
  /** Optional source-owned channel metadata for transport-specific recovery. */
  sourceChannel?: string;
};
export type OutboundPreparation<Message> =
  | { kind: "suppress"; reason: string }
  | { kind: "defer"; nextAttemptAt: Date }
  | { kind: "fail"; reason: string }
  | { kind: "ready"; message: Message };

export type OutboundSendResult = boolean | {
  accepted: boolean;
  /** Provider-assigned message ID; contains no recipient contact data. */
  providerMessageId?: string;
};

export type OutboundAdapter<Message> = {
  claim(now: Date, seenIds: readonly string[], leaseMs: number): Promise<OutboundClaim | null>;
  prepare(claim: OutboundClaim, now: Date): Promise<OutboundPreparation<Message>>;
  /** CAS on the old lease. Return null if another worker owns this claim. */
  renew(claim: OutboundClaim, now: Date, leaseMs: number): Promise<OutboundClaim | null>;
  /** Return the claimed receipt to pending without consuming an attempt. */
  defer?(claim: OutboundClaim, until: Date, now: Date): Promise<boolean>;
  /** Transport must reuse claim.id as its idempotency key. */
  send(message: Message, idempotencyKey: string): Promise<OutboundSendResult>;
  /**
   * Every write is fenced by the claim's renewed lease and processing state.
   * Return false when ownership has changed; do not count unowned results.
   */
  settle(
    claim: OutboundClaim,
    result: {
      kind: "accepted" | "failed" | "suppressed";
      now: Date;
      attempts: number;
      nextAttemptAt: Date | null;
      reason: string | null;
      providerMessageId?: string;
    },
  ): Promise<boolean>;
  /** A crash during preparation/transport also consumes one attempt. */
  attemptsAfterError(claim: OutboundClaim): Promise<number | null>;
};

export type OutboundDispatchSummary = {
  accepted: number;
  suppressed: number;
  failed: number;
};

export async function dispatchOutboundMessages<Message>(
  adapter: OutboundAdapter<Message>,
  options: {
    now?: Date;
    limit?: number;
    leaseMs?: number;
    maxAttempts?: number;
    retryDelayMs?: (attempt: number) => number;
    clock?: () => Date;
  } = {},
): Promise<OutboundDispatchSummary> {
  const started = options.now ?? new Date();
  const clock = options.clock ?? (() => new Date(Math.max(Date.now(), started.getTime())));
  const leaseMs = options.leaseMs ?? OUTBOUND_LEASE_MS;
  const maxAttempts = options.maxAttempts ?? OUTBOUND_MAX_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? outboundRetryDelayMs;
  const limit = Math.min(100, Math.max(0, Math.trunc(options.limit ?? 30)));
  const seen: string[] = [];
  const totals = { accepted: 0, suppressed: 0, failed: 0 };
  while (seen.length < limit) {
    const claimed = await adapter.claim(clock(), seen, leaseMs);
    if (!claimed) break;
    if (seen.includes(claimed.id)) {
      throw new Error("Outbound adapter reclaimed the same receipt within a dispatch run");
    }
    seen.push(claimed.id);
    const outcome = await processOutboundClaim(adapter, claimed, {
      clock, leaseMs, maxAttempts, retryDelayMs,
    });
    if (outcome) totals[outcome]++;
  }
  return totals;
}

/** Process one receipt independently from batch iteration and aggregation. */
async function processOutboundClaim<Message>(
  adapter: OutboundAdapter<Message>,
  claimed: OutboundClaim,
  options: {
    clock: () => Date;
    leaseMs: number;
    maxAttempts: number;
    retryDelayMs: (attempt: number) => number;
  },
): Promise<keyof OutboundDispatchSummary | null> {
  const { clock, leaseMs, maxAttempts, retryDelayMs } = options;
  let active = claimed;
  try {
    const prepared = await adapter.prepare(active, clock());
    if (prepared.kind === "suppress") {
      return await adapter.settle(active, {
        kind: "suppressed", reason: prepared.reason,
        attempts: active.attempts, nextAttemptAt: null, now: clock(),
      }) ? "suppressed" : null;
    }
    if (prepared.kind === "defer") {
      if (!adapter.defer) throw new Error("Outbound adapter does not support deferral");
      await adapter.defer(active, prepared.nextAttemptAt, clock());
      return null;
    }
    if (prepared.kind === "fail") {
      return await adapter.settle(active, {
        kind: "failed", reason: prepared.reason,
        attempts: active.attempts + 1, nextAttemptAt: null, now: clock(),
      }) ? "failed" : null;
    }
    const renewed = await adapter.renew(active, clock(), leaseMs);
    if (!renewed) return null;
    active = renewed;
    const providerResult = await adapter.send(prepared.message, active.id);
    const providerAccepted = typeof providerResult === "boolean" ? providerResult : providerResult.accepted;
    const providerMessageId = typeof providerResult === "boolean" ? undefined : providerResult.providerMessageId;
    const attempts = active.attempts + 1;
    const at = clock();
    const kind = providerAccepted ? "accepted" : "failed";
    return await adapter.settle(active, {
      kind, now: at, attempts,
      reason: providerAccepted ? null : "provider_not_accepted",
      ...(providerAccepted && providerMessageId ? { providerMessageId } : {}),
      nextAttemptAt: providerAccepted || attempts >= maxAttempts
        ? null : new Date(at.getTime() + retryDelayMs(attempts)),
    }) ? kind : null;
  } catch {
    const attempts = await adapter.attemptsAfterError(active);
    if (attempts === null) return null; // Lost ownership: do not mutate.
    const at = clock();
    return await adapter.settle(active, {
      kind: "failed", attempts, now: at,
      reason: "delivery_worker_error",
      nextAttemptAt: attempts >= maxAttempts
        ? null : new Date(at.getTime() + retryDelayMs(attempts)),
    }) ? "failed" : null;
  }
}
